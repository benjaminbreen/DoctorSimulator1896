"""Retarget the existing nine Mixamo performances to a fitted patient rig."""

import math
import os

import bpy
from mathutils import Vector


def retarget(rig, root, lap_height=.60, lap_forward=-.12):
    def suffix(name):
        return name.split(':')[-1]

    motions = [
        ('tripo-victorian-player/Sitting Idle Hands on Knees.fbx', 'ClinicIdle'),
        ('tripo-victorian-player/Sitting Talking.fbx', 'SittingTalking'),
        ('nora-byrne/Sitting Rubbing Arm.fbx', 'SittingSelfSoothing'),
        ('nora-byrne/Sitting Disapproval.fbx', 'SittingDisapproval'),
        ('nora-byrne/Sitting Disbelief.fbx', 'SittingDisbelief'),
        ('tripo-victorian-player/Standing Idle.fbx', 'StandingIdle'),
        ('tripo-victorian-player/Walking Standard.fbx', 'Walk'),
        ('tripo-victorian-player/Standing To Sitting.fbx', 'SitDown'),
        ('tripo-victorian-player/Sitting To Standing.fbx', 'StandUp'),
    ]
    limbs = {'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftHand', 'RightHand'}
    actions = []
    scene = bpy.context.scene
    scene.render.fps = 30
    rig.animation_data_create()

    def clear_lap(side, frame):
        upper = rig.pose.bones[f'mixamorig:{side}Arm']
        lower = rig.pose.bones[f'mixamorig:{side}ForeArm']
        hand = rig.pose.bones[f'mixamorig:{side}Hand']
        origin, elbow, wrist = [b.matrix.translation.copy() for b in (upper, lower, hand)]
        if wrist.z >= lap_height or wrist.y > lap_forward:
            return
        target = wrist.copy()
        target.z = lap_height
        length1, length2 = (elbow-origin).length, (wrist-elbow).length
        direction = target-origin
        distance = min(direction.length, (length1+length2)*.99)
        direction.normalize()
        pole = elbow-origin
        pole -= direction*pole.dot(direction)
        if pole.length < .001:
            pole = Vector((1 if side == 'Left' else -1, 0, 0))
        pole.normalize()
        cosine = max(-1, min(1, (length1*length1+distance*distance-length2*length2)/(2*length1*distance)))
        desired_elbow = origin + direction*(length1*cosine) + pole*(length1*math.sqrt(1-cosine*cosine))
        hand_rotation = hand.matrix.to_quaternion()
        for bone, child, desired_point in [(upper, lower, desired_elbow), (lower, hand, target)]:
            a = child.matrix.translation-bone.matrix.translation
            b = desired_point-bone.matrix.translation
            rotation = a.rotation_difference(b) @ bone.matrix.to_quaternion()
            matrix = rotation.to_matrix().to_4x4()
            matrix.translation = bone.matrix.translation
            bone.matrix = matrix
            bpy.context.view_layer.update()
        matrix = hand_rotation.to_matrix().to_4x4()
        matrix.translation = hand.matrix.translation
        hand.matrix = matrix
        for bone in (upper, lower, hand):
            bone.keyframe_insert('rotation_quaternion', frame=frame, group=bone.name)

    for relative, name in motions:
        before = set(scene.objects)
        bpy.ops.import_scene.fbx(filepath=os.path.join(root, 'assets/source', relative), automatic_bone_orientation=False)
        imported = [o for o in scene.objects if o not in before]
        source = next(o for o in imported if o.type == 'ARMATURE')
        source_action = source.animation_data.action
        mapped = {suffix(b.name): b for b in source.pose.bones}
        offsets = {}
        for bone in rig.data.bones:
            key = suffix(bone.name)
            if key not in mapped:
                continue
            source_rest = source.matrix_world @ mapped[key].bone.matrix_local
            target_rest = rig.matrix_world @ bone.matrix_local
            orientation = source_rest.to_quaternion().inverted() @ target_rest.to_quaternion()
            if key in limbs:
                a = source_rest.to_quaternion() @ Vector((0, 1, 0))
                b = target_rest.to_quaternion() @ Vector((0, 1, 0))
                orientation = source_rest.to_quaternion().inverted() @ a.rotation_difference(b).inverted() @ target_rest.to_quaternion()
            offsets[bone.name] = orientation
        target_hips = rig.data.bones['mixamorig:Hips']
        source_hips = mapped['Hips']
        scale = (rig.matrix_world @ target_hips.head_local).z / (source.matrix_world @ source_hips.bone.head_local).z
        action = bpy.data.actions.new(name)
        rig.animation_data.action = action
        start, end = [int(round(v)) for v in source_action.frame_range]
        source.animation_data.action = source_action
        source_start = None
        for frame in range(start, end + 1):
            scene.frame_set(frame)
            bpy.context.view_layer.update()
            for bone in rig.pose.bones:
                key = suffix(bone.name)
                bone.rotation_mode = 'QUATERNION'
                bone.location = (0, 0, 0)
                bone.scale = (1, 1, 1)
                if bone.name in offsets and not any(part in key for part in ('Thumb', 'Index', 'Middle', 'Ring', 'Pinky')):
                    desired = (source.matrix_world @ mapped[key].matrix).to_quaternion() @ offsets[bone.name]
                    if key == 'Head' and (name == 'ClinicIdle' or name.startswith('Sitting')):
                        source_rest = (source.matrix_world @ mapped[key].bone.matrix_local).to_quaternion()
                        delta = ((source.matrix_world @ mapped[key].matrix).to_quaternion() @ source_rest.inverted()).to_euler('XYZ')
                        delta.x = max(-.07, min(.07, delta.x))
                        delta.y = max(-.10, min(.10, delta.y))
                        desired = delta.to_quaternion() @ (rig.matrix_world @ bone.bone.matrix_local).to_quaternion()
                    matrix = desired.to_matrix().to_4x4()
                    matrix.translation = bone.matrix.translation
                    if key == 'Hips':
                        point = (source.matrix_world @ mapped[key].matrix).translation * scale
                        if source_start is None:
                            source_start = point.copy()
                        if name == 'Walk':
                            point.y = 0
                            point.x -= source_start.x
                        matrix.translation = point
                    bone.matrix = rig.matrix_world.inverted() @ matrix
                    bpy.context.view_layer.update()
                else:
                    bone.rotation_quaternion = (1, 0, 0, 0)
                bone.keyframe_insert('rotation_quaternion', frame=frame, group=bone.name)
                if key == 'Hips':
                    bone.keyframe_insert('location', frame=frame, group=bone.name)
            if name == 'ClinicIdle' or name.startswith('Sitting'):
                clear_lap('Left', frame)
                clear_lap('Right', frame)
        action.use_fake_user = True
        actions.append(action)
        rig.animation_data.action = None
        for obj in imported:
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.actions.remove(source_action)
        print('MODULAR_MOTION', name, start, end)

    return actions


def fit_head_to_torso(rig, actions):
    """Keep the donor neck's lean relative to its own chest within bounds."""
    chest = rig.pose.bones['mixamorig:Spine2']
    neck = rig.pose.bones['mixamorig:Neck']
    head = rig.pose.bones['mixamorig:Head']
    rest_chest = chest.bone.matrix_local.to_quaternion()
    rest_neck = neck.bone.matrix_local.to_quaternion()
    rig.data.pose_position = 'POSE'
    for action in actions:
        rig.animation_data.action = action
        rig.animation_data.action_slot = action.slots[0]
        for frame in range(round(action.frame_range[0]), round(action.frame_range[1])+1):
            bpy.context.scene.frame_set(frame)
            bpy.context.view_layer.update()
            head_rotation = head.matrix.to_quaternion()
            chest_delta = chest.matrix.to_quaternion() @ rest_chest.inverted()
            relative = (chest_delta.inverted() @ neck.matrix.to_quaternion() @ rest_neck.inverted()).to_euler('XYZ')
            for axis, limit in enumerate((.10, .08, .055)):
                relative[axis] = max(-limit, min(limit, relative[axis]))
            matrix = (chest_delta @ relative.to_quaternion() @ rest_neck).to_matrix().to_4x4()
            matrix.translation = neck.matrix.translation
            neck.matrix = matrix
            bpy.context.view_layer.update()
            matrix = head_rotation.to_matrix().to_4x4()
            matrix.translation = head.matrix.translation
            head.matrix = matrix
            for bone in (neck, head):
                bone.keyframe_insert('rotation_quaternion', frame=frame, group=bone.name)
        rig.animation_data.action = None


def rest_hands_on_knees(rig, action, palms_inward=False):
    """Fit the new male idle to its own knees and turn each palm down."""
    from mathutils import Matrix
    scene = bpy.context.scene
    rig.data.pose_position = 'POSE'
    rig.animation_data.action = action
    rig.animation_data.action_slot = action.slots[0]
    rotations = {}
    for side in ['Left','Right']:
        bone = rig.data.bones[f'mixamorig:{side}Hand']
        forward = (rig.data.bones[f'mixamorig:{side}HandMiddle1'].head_local-bone.head_local).normalized()
        across = rig.data.bones[f'mixamorig:{side}HandIndex1'].head_local-rig.data.bones[f'mixamorig:{side}HandPinky1'].head_local
        normal = forward.cross(across).normalized()
        if palms_inward:
            if normal.x*(1 if side == 'Left' else -1) > 0: normal.negate()
        elif normal.y > 0:
            normal.negate()
        across = forward.cross(normal).normalized()
        rest = Matrix((across,forward,normal)).transposed()
        desired_forward = Vector((0,-1,.04)).normalized()
        desired_normal = Vector((0,-.04,-1)).normalized()
        desired_across = desired_forward.cross(desired_normal).normalized()
        desired = Matrix((desired_across,desired_forward,desired_normal)).transposed()
        rotations[side]=(desired @ rest.transposed() @ bone.matrix_local.to_3x3()).to_quaternion()
    start,end=[round(n) for n in action.frame_range]
    for frame in range(start,end+1):
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        for side in ['Left','Right']:
            upper=rig.pose.bones[f'mixamorig:{side}Arm']
            lower=rig.pose.bones[f'mixamorig:{side}ForeArm']
            hand=rig.pose.bones[f'mixamorig:{side}Hand']
            knee=rig.pose.bones[f'mixamorig:{side}Leg'].matrix.translation
            hip=rig.pose.bones[f'mixamorig:{side}UpLeg'].matrix.translation
            target=knee+(hip-knee).normalized()*.095+Vector((0,0,.112))
            origin,elbow,wrist=[b.matrix.translation.copy() for b in [upper,lower,hand]]
            length1,length2=(elbow-origin).length,(wrist-elbow).length
            direction=target-origin
            distance=min(direction.length,(length1+length2)*.99)
            direction.normalize()
            pole=elbow-origin;pole-=direction*pole.dot(direction)
            if pole.length<.001:pole=Vector((1 if side=='Left' else -1,0,0))
            pole.normalize()
            cosine=max(-1,min(1,(length1*length1+distance*distance-length2*length2)/(2*length1*distance)))
            desired_elbow=origin+direction*(length1*cosine)+pole*(length1*math.sqrt(1-cosine*cosine))
            for bone,child,point in [(upper,lower,desired_elbow),(lower,hand,target)]:
                a=child.matrix.translation-bone.matrix.translation
                b=point-bone.matrix.translation
                matrix=(a.rotation_difference(b) @ bone.matrix.to_quaternion()).to_matrix().to_4x4()
                matrix.translation=bone.matrix.translation
                bone.matrix=matrix
                bpy.context.view_layer.update()
            matrix=rotations[side].to_matrix().to_4x4();matrix.translation=hand.matrix.translation
            hand.matrix=matrix
            for bone in [upper,lower,hand]:bone.keyframe_insert('rotation_quaternion',frame=frame,group=bone.name)
            for bone in rig.pose.bones:
                if bone.name.startswith(f'mixamorig:{side}Hand') and bone!=hand:
                    bone.rotation_mode='QUATERNION';bone.rotation_quaternion.identity()
                    bone.keyframe_insert('rotation_quaternion',frame=frame,group=bone.name)
            bpy.context.view_layer.update()
            thumb=rig.pose.bones[f'mixamorig:{side}HandThumb1']
            tip=rig.pose.bones[f'mixamorig:{side}HandThumb3'].tail
            if tip.z<hand.matrix.translation.z-.010:
                current=tip-thumb.head;desired=current.copy()
                desired.z=hand.matrix.translation.z-.010-thumb.head.z
                matrix=(current.rotation_difference(desired) @ thumb.matrix.to_quaternion()).to_matrix().to_4x4()
                matrix.translation=thumb.head;thumb.matrix=matrix
                thumb.keyframe_insert('rotation_quaternion',frame=frame,group=thumb.name)
    rig.animation_data.action=None
