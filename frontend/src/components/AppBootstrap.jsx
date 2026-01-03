import { useAuth } from "../context/AuthContext.jsx";
import "./AppBootstrap.css";

function AppBootstrap({ children }) {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="app-bootstrap">
        <div className="app-bootstrap__card">
          <div className="app-bootstrap__spinner" />
          <p>Loading your workspace...</p>
        </div>
      </div>
    );
  }

  return children;
}

export default AppBootstrap;
