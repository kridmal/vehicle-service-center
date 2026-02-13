import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import api from "../services/api.js";
import "./Workers.css";

const TRIGGER_TYPES = [
  { value: "visit_count", label: "Visit Count" },
  { value: "spend_amount", label: "Spend Amount" },
];

const REWARD_TYPES = [
  { value: "free_service", label: "Free Service" },
  { value: "discount_percentage", label: "Discount %" },
  { value: "discount_fixed", label: "Discount Fixed" },
  { value: "free_labor", label: "Free Labor" },
];

const EMPTY_FORM = {
  name: "",
  description: "",
  serviceTypeId: "",
  triggerType: "visit_count",
  triggerValue: "",
  rewardType: "free_service",
  rewardValue: "",
  rewardServiceTypeId: "",
  isActive: true,
};

function LoyaltySettings() {
  const [rules, setRules] = useState([]);
  const [services, setServices] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const loadRules = async () => {
    try {
      const { data } = await api.get("/loyalty/rules");
      setRules(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load loyalty rules.");
    }
  };

  const loadServices = async () => {
    try {
      const { data } = await api.get("/services");
      setServices(Array.isArray(data) ? data : []);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    loadRules();
    loadServices();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        ...form,
        triggerValue: Number(form.triggerValue || 0),
        rewardValue: Number(form.rewardValue || 0),
        serviceTypeId: form.serviceTypeId || null,
        rewardServiceTypeId: form.rewardServiceTypeId || null,
      };
      if (editingId) {
        await api.put(`/loyalty/rules/${editingId}`, payload);
        setMessage("Rule updated.");
      } else {
        await api.post("/loyalty/rules", payload);
        setMessage("Rule created.");
      }
      setForm(EMPTY_FORM);
      setEditingId("");
      await loadRules();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to save rule.");
    } finally {
      setSaving(false);
    }
  };

  const deleteRule = async (id) => {
    setError("");
    setMessage("");
    try {
      await api.delete(`/loyalty/rules/${id}`);
      setMessage("Rule deleted.");
      await loadRules();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to delete rule.");
    }
  };

  const toggleActive = async (rule) => {
    try {
      await api.put(`/loyalty/rules/${rule._id}`, {
        isActive: !rule.isActive,
      });
      await loadRules();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to toggle rule.");
    }
  };

  return (
    <div className="workers-page">
      <div className="workers-header">
        <div>
          <PageHeader title="Loyalty Program" />
          <p className="workers-subtitle">
            Configure loyalty rules, triggers, and rewards.
          </p>
        </div>
      </div>

      {error ? <p className="workers-error">{error}</p> : null}
      {message ? <p className="workers-success">{message}</p> : null}

      <section className="workers-card">
        <div className="workers-card__head">
          <h2>{editingId ? "Edit Rule" : "Add Rule"}</h2>
          <p>
            Define when customers earn rewards and what they receive.
          </p>
        </div>
        <form className="workers-form" onSubmit={handleSubmit}>
          <div className="workers-grid">
            <div className="workers-field">
              <label>Rule Name</label>
              <input
                value={form.name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, name: e.target.value }))
                }
                required
              />
            </div>
            <div className="workers-field">
              <label>Description</label>
              <input
                value={form.description}
                onChange={(e) =>
                  setForm((p) => ({ ...p, description: e.target.value }))
                }
              />
            </div>
            <div className="workers-field">
              <label>Service Type (optional)</label>
              <select
                value={form.serviceTypeId}
                onChange={(e) =>
                  setForm((p) => ({ ...p, serviceTypeId: e.target.value }))
                }
              >
                <option value="">Any Service</option>
                {services.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="workers-field">
              <label>Trigger Type</label>
              <select
                value={form.triggerType}
                onChange={(e) =>
                  setForm((p) => ({ ...p, triggerType: e.target.value }))
                }
              >
                {TRIGGER_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="workers-field">
              <label>Trigger Value</label>
              <input
                type="number"
                min="1"
                value={form.triggerValue}
                onChange={(e) =>
                  setForm((p) => ({ ...p, triggerValue: e.target.value }))
                }
                required
              />
            </div>
            <div className="workers-field">
              <label>Reward Type</label>
              <select
                value={form.rewardType}
                onChange={(e) =>
                  setForm((p) => ({ ...p, rewardType: e.target.value }))
                }
              >
                {REWARD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="workers-field">
              <label>Reward Value</label>
              <input
                type="number"
                min="0"
                value={form.rewardValue}
                onChange={(e) =>
                  setForm((p) => ({ ...p, rewardValue: e.target.value }))
                }
                required
              />
            </div>
            <div className="workers-field">
              <label>Reward Service Type (optional)</label>
              <select
                value={form.rewardServiceTypeId}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    rewardServiceTypeId: e.target.value,
                  }))
                }
              >
                <option value="">None</option>
                {services.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <label className="workers-toggle">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) =>
                  setForm((p) => ({ ...p, isActive: e.target.checked }))
                }
              />
              Active
            </label>
          </div>
          <div className="workers-actions">
            {editingId ? (
              <button
                type="button"
                onClick={() => {
                  setEditingId("");
                  setForm(EMPTY_FORM);
                }}
              >
                Cancel
              </button>
            ) : null}
            <button type="submit" disabled={saving}>
              {editingId ? "Save Changes" : "Create Rule"}
            </button>
          </div>
        </form>
      </section>

      <section className="workers-card">
        <div className="workers-card__head">
          <h2>Loyalty Rules</h2>
          <p>Active rules automatically apply to qualifying customers.</p>
        </div>
        <div className="workers-table">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Trigger</th>
                <th>Reward</th>
                <th>Service</th>
                <th>Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule._id}>
                  <td>{rule.name}</td>
                  <td>
                    {rule.triggerType === "visit_count"
                      ? `${rule.triggerValue} visits`
                      : `Rs. ${rule.triggerValue} spent`}
                  </td>
                  <td>
                    {rule.rewardType === "free_service"
                      ? "Free Service"
                      : rule.rewardType === "discount_percentage"
                        ? `${rule.rewardValue}% off`
                        : rule.rewardType === "discount_fixed"
                          ? `Rs. ${rule.rewardValue} off`
                          : "Free Labor"}
                  </td>
                  <td>
                    {rule.serviceTypeId?.name ||
                      rule.rewardServiceTypeId?.name ||
                      "Any"}
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => toggleActive(rule)}
                      style={{
                        background: rule.isActive ? "#16a34a" : "#94a3b8",
                        color: "#fff",
                        border: "none",
                        borderRadius: "4px",
                        padding: "2px 10px",
                        cursor: "pointer",
                      }}
                    >
                      {rule.isActive ? "Yes" : "No"}
                    </button>
                  </td>
                  <td className="workers-actions-cell">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(rule._id);
                        setForm({
                          name: rule.name || "",
                          description: rule.description || "",
                          serviceTypeId: rule.serviceTypeId?._id || rule.serviceTypeId || "",
                          triggerType: rule.triggerType || "visit_count",
                          triggerValue: String(rule.triggerValue || ""),
                          rewardType: rule.rewardType || "free_service",
                          rewardValue: String(rule.rewardValue || ""),
                          rewardServiceTypeId:
                            rule.rewardServiceTypeId?._id || rule.rewardServiceTypeId || "",
                          isActive: rule.isActive !== false,
                        });
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteRule(rule._id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {rules.length === 0 ? (
                <tr>
                  <td colSpan={6}>No loyalty rules configured.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default LoyaltySettings;
