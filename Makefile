BLENDER ?= /Applications/Blender.app/Contents/MacOS/Blender
PRESET ?= character-lab/public/presets/mrs-ostrander-1896.json
MODEL ?= character-lab/public/models/mrs-ostrander-1896.glb
PREVIEW ?= character-lab/public/models/mrs-ostrander-1896-contact-sheet.png
ROOT := $(CURDIR)

.PHONY: character lab-build validate test

character:
	open -W -n -a Blender --args --background --python-exit-code 1 --python "$(ROOT)/scripts/characters/generate_patient.py" -- --preset "$(ROOT)/$(PRESET)" --output "$(ROOT)/$(MODEL)" --preview "$(ROOT)/$(PREVIEW)"

lab-build:
	npm run lab:build

validate:
	npm run character:validate

test: validate lab-build
