export default function Card({ title, children, className = "" }) {
  return (
    <div className={`card ${className}`}>
      {title && <h3 className="text-md font-semibold text-black mb-3">{title}</h3>}
      {children}
    </div>
  );
}
