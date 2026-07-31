export default function Skeleton({ width = '100%', height = 16, radius = 8, style = {} }) {
  return <div className="skeleton" style={{ width, height, borderRadius: radius, ...style }} />;
}