import { useState } from "react";

import { createCase } from "../supabase/db";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

import { generateCaseId } from "../utils/idGenerator";
import { parseSupabaseError } from "../utils/supabaseErrors";

import Input from "../components/ui/Input";
import Select from "../components/ui/Select";
import Textarea from "../components/ui/Textarea";
import Button from "../components/ui/Button";

export default function CaseCreate() {
  const [caseId, setCaseId] = useState(generateCaseId());
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [investigatorName, setInvestigatorName] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [status, setStatus] = useState("Open");

  const navigate = useNavigate();
  const { user } = useAuth();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();

    setError("");

    if (!title.trim()) {
      setError("Investigation title is required.");
      return;
    }

    if (!investigatorName.trim()) {
      setError("Investigator name is required");
      return;
    }

    setIsSubmitting(true);

    try {
      const { data, error } = await createCase({
        case_id: caseId,
        title,
        description,
        investigator_name: investigatorName,
        priority,
        status,
        created_by: user.id,
      });

      if (error) {
        setError(error);
        return;
      }
      alert("Investigation created successfully.");
      navigate("/cases");
    } catch (err) {
      setError(err.message || "Something went wrong.");
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  }
  return (
    <form
      onSubmit={handleSubmit}
      style={{
        maxWidth: "700px",
        margin: "40px auto",
        padding: "30px",
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
      }}
    >
      <h1
        style={{
          color: "var(--text-primary)",
          marginBottom: "25px",
        }}
      >
        Create Investigation
      </h1>

      <Input
        placeholder="Investigation Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <Input label="Case ID" value={caseId} readOnly />
      <Button type="button" onClick={() => setCaseId(generateCaseId())}>
        Generate New ID
      </Button>
      <Input
        placeholder="Investigator Name"
        value={investigatorName}
        onChange={(e) => setInvestigatorName(e.target.value)}
      />
      <Textarea
        placeholder="Description"
        rows={6}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
        <option>Low</option>
        <option>Medium</option>
        <option>High</option>
        <option>Critical</option>
      </Select>

      <Select value={status} onChange={(e) => setStatus(e.target.value)}>
        <option>Open</option>
        <option>Active</option>
        <option>Pending Review</option>
        <option>Closed</option>
      </Select>
      {error && (
        <p
          style={{
            color: "var(--danger)",
            marginBottom: "15px",
            fontWeight: "500",
          }}
        >
          {error}
        </p>
      )}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creating..." : "Create Investigation"}
      </Button>
    </form>
  );
}
