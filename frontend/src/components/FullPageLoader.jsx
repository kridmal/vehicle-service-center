import "./AppBootstrap.css";

function FullPageLoader({ message = "Loading your workspace..." }) {
  return (
    <div className="app-bootstrap">
      <div className="app-bootstrap__card">
        <div className="app-bootstrap__spinner" />
        <p>{message}</p>
      </div>
    </div>
  );
}

export default FullPageLoader;
