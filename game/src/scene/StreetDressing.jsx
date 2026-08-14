import DistrictFlags from './DistrictFlags.jsx';
import StreetSigns from './StreetSigns.jsx';

export default function StreetDressing({ runtime }) {
  return (
    <group name="selective 1896 Fifth Avenue street dressing">
      <DistrictFlags runtime={runtime} />
      <StreetSigns />
    </group>
  );
}
