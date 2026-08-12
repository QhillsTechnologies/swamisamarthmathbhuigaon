import { useRouter } from "next/router";

export default function StatCard({
  title,
  value,
  color,
  link,
}) {
  const router = useRouter();

  const handleClick = () => {
    if (link) {
      router.push(link);
    }
  };

  return (
    <div
      className="db-card db-stat-card"
      onClick={handleClick}
      style={{
        cursor: link ? "pointer" : "default",
      }}
    >
      <div>
        <p className="db-card-title">{title}</p>
        <h2 className={`db-${color}`}>{value}</h2>
      </div>


    </div>
  );
}