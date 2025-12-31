import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import PageHeader from "../../components/PageHeader.jsx";
import { useLocalStorageState } from "../../hooks/useLocalStorageState.js";
import api from "../../services/api.js";

function JobCardBilling() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [jobCards] = useLocalStorageState("ksc_job_cards", []);
  const [invoice, setInvoice] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const jobCard = jobCards.find((job) => job.id === id);

  useEffect(() => {
    if (!jobCard?.mongoId) return;
    const loadInvoice = async () => {
      setIsLoading(true);
      setError("");
      try {
        const { data } = await api.get("/invoices", {
          params: { jobCardId: jobCard.mongoId },
        });
        const match = Array.isArray(data) ? data[0] : null;
        if (match) {
          setInvoice(match);
          navigate(`/invoices/${match._id}`, { replace: true });
        }
      } catch (error) {
        setError(
          error.response?.data?.message ||
            "Unable to load invoice for this job card."
        );
      } finally {
        setIsLoading(false);
      }
    };
    loadInvoice();
  }, [jobCard, navigate]);

  return (
    <div>
      <PageHeader title="Billing" />
      {error ? <p>{error}</p> : null}
      {isLoading ? <p>Loading invoice...</p> : null}
      {!invoice ? (
        <p>
          No invoice exists for this job card yet. Generate it from the job card
          once the job is completed.
        </p>
      ) : null}
      <p>
        <Link to="/job-cards">Back to job cards</Link>
      </p>
    </div>
  );
}

export default JobCardBilling;
