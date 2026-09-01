import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api.js";

const emptyDealerForm = () => ({
  dealerCode: "",
  name: "",
  address: "",
  phone1: "",
  phone2: "",
  email: "",
  notes: "",
});

/**
 * Self-contained dealer search + inline-create form.
 *
 * Props:
 *   onDealerChange(dealerId: string)  — called whenever selection changes
 *   initialDealerId?: string          — pre-selected dealer id (optional)
 */
function DealerSelector({ onDealerChange, initialDealerId = "" }) {
  const navigate = useNavigate();
  const [dealers, setDealers] = useState([]);
  const [dealerSearch, setDealerSearch] = useState("");
  const [selectedDealerId, setSelectedDealerId] = useState(initialDealerId);
  const [showDealerForm, setShowDealerForm] = useState(false);
  const [dealerForm, setDealerForm] = useState(emptyDealerForm());
  const [formError, setFormError] = useState("");
  const [formNotice, setFormNotice] = useState("");

  const loadDealers = useCallback(async () => {
    try {
      const { data } = await api.get("/dealers");
      const list = Array.isArray(data) ? data : [];
      setDealers(list);
      // If we have an initialDealerId and haven't yet set the search text, populate it
      if (initialDealerId && !dealerSearch) {
        const match = list.find((d) => String(d._id) === String(initialDealerId));
        if (match) {
          setDealerSearch(`${match.dealerCode} - ${match.name}`);
        }
      }
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        navigate("/login", { replace: true });
      }
    }
  }, [navigate, initialDealerId]);

  useEffect(() => {
    loadDealers();
  }, [loadDealers]);

  const selectedDealer = useMemo(
    () => dealers.find((d) => String(d._id) === String(selectedDealerId)) || null,
    [dealers, selectedDealerId]
  );

  const selectDealer = (dealer) => {
    setSelectedDealerId(dealer._id);
    setDealerSearch(`${dealer.dealerCode} - ${dealer.name}`);
    setShowDealerForm(false);
    setDealerForm(emptyDealerForm());
    onDealerChange(dealer._id);
  };

  const clearDealer = () => {
    setSelectedDealerId("");
    onDealerChange("");
  };

  const handleDealerSearchChange = (value) => {
    setDealerSearch(value);
    const query = value.trim().toLowerCase();
    const match =
      dealers.find(
        (d) =>
          d.dealerCode?.toLowerCase() === query ||
          d.name?.toLowerCase() === query ||
          `${d.dealerCode} - ${d.name}`.toLowerCase() === query
      ) || null;
    if (match) {
      selectDealer(match);
      return;
    }
    if (selectedDealerId) clearDealer();
  };

  const handleCreateDealer = async () => {
    if (!dealerForm.name.trim()) {
      setFormError("Dealer name is required.");
      return;
    }
    setFormError("");
    setFormNotice("");
    try {
      const { data } = await api.post("/dealers", {
        dealerCode: dealerForm.dealerCode.trim(),
        name: dealerForm.name.trim(),
        address: dealerForm.address.trim(),
        phone1: dealerForm.phone1.trim(),
        phone2: dealerForm.phone2.trim(),
        email: dealerForm.email.trim(),
        notes: dealerForm.notes.trim(),
      });
      await loadDealers();
      selectDealer(data);
      setFormNotice(`Dealer ${data.dealerCode} created.`);
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        navigate("/login", { replace: true });
        return;
      }
      setFormError(err.response?.data?.message || "Unable to create dealer right now.");
    }
  };

  const setField = (field, value) =>
    setDealerForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div>
      <div className="purchases-head">
        <div>
          <h2>Dealer Selection</h2>
          <p>Select dealer by code/name and auto-fill dealer details.</p>
        </div>
        <button
          type="button"
          className="purchases-button-ghost"
          onClick={() => setShowDealerForm((prev) => !prev)}
        >
          {showDealerForm ? "Hide Dealer Form" : "+ Add Dealer"}
        </button>
      </div>

      <div className="purchases-grid">
        <div className="purchases-field">
          <label htmlFor="dealer-search">Dealer (Code or Name)</label>
          <input
            id="dealer-search"
            type="search"
            list="dealer-options"
            value={dealerSearch}
            onChange={(e) => handleDealerSearchChange(e.target.value)}
            placeholder="Type dealer code or name"
          />
          <datalist id="dealer-options">
            {dealers.map((d) => (
              <option key={d._id} value={`${d.dealerCode} - ${d.name}`} />
            ))}
            {dealers.map((d) => (
              <option key={`${d._id}-code`} value={d.dealerCode} />
            ))}
            {dealers.map((d) => (
              <option key={`${d._id}-name`} value={d.name} />
            ))}
          </datalist>
        </div>
        <div className="purchases-field">
          <label htmlFor="dealer-code-readonly">Dealer Code</label>
          <input
            id="dealer-code-readonly"
            value={selectedDealer?.dealerCode || "-"}
            readOnly
          />
        </div>
      </div>

      <div className="purchases-grid">
        <div className="purchases-field">
          <label htmlFor="dealer-address-readonly">Address</label>
          <input
            id="dealer-address-readonly"
            value={selectedDealer?.address || "-"}
            readOnly
          />
        </div>
        <div className="purchases-field">
          <label htmlFor="dealer-phone-readonly">Phones</label>
          <input
            id="dealer-phone-readonly"
            value={
              selectedDealer
                ? [selectedDealer.phone1, selectedDealer.phone2]
                    .filter(Boolean)
                    .join(" / ") || "-"
                : "-"
            }
            readOnly
          />
        </div>
      </div>

      {showDealerForm ? (
        <div className="purchases-card">
          {formError ? (
            <p className="purchases-alert purchases-alert--error">{formError}</p>
          ) : null}
          {formNotice ? (
            <p className="purchases-alert purchases-alert--success">{formNotice}</p>
          ) : null}
          <div className="purchases-grid">
            <div className="purchases-field">
              <label htmlFor="new-dealer-code">Dealer Code (optional)</label>
              <input
                id="new-dealer-code"
                value={dealerForm.dealerCode}
                onChange={(e) => setField("dealerCode", e.target.value)}
              />
            </div>
            <div className="purchases-field">
              <label htmlFor="new-dealer-name">Dealer Name</label>
              <input
                id="new-dealer-name"
                value={dealerForm.name}
                onChange={(e) => setField("name", e.target.value)}
              />
            </div>
          </div>
          <div className="purchases-grid">
            <div className="purchases-field">
              <label htmlFor="new-dealer-address">Address</label>
              <input
                id="new-dealer-address"
                value={dealerForm.address}
                onChange={(e) => setField("address", e.target.value)}
              />
            </div>
            <div className="purchases-field">
              <label htmlFor="new-dealer-phone1">Phone 1</label>
              <input
                id="new-dealer-phone1"
                value={dealerForm.phone1}
                onChange={(e) => setField("phone1", e.target.value)}
              />
            </div>
          </div>
          <div className="purchases-grid">
            <div className="purchases-field">
              <label htmlFor="new-dealer-phone2">Phone 2</label>
              <input
                id="new-dealer-phone2"
                value={dealerForm.phone2}
                onChange={(e) => setField("phone2", e.target.value)}
              />
            </div>
            <div className="purchases-field">
              <label htmlFor="new-dealer-email">Email</label>
              <input
                id="new-dealer-email"
                type="email"
                value={dealerForm.email}
                onChange={(e) => setField("email", e.target.value)}
              />
            </div>
          </div>
          <div className="purchases-actions">
            <button
              type="button"
              className="purchases-button"
              onClick={handleCreateDealer}
            >
              Save Dealer
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default DealerSelector;
