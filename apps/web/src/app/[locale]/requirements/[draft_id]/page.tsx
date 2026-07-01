"use client";

import { useParams } from "next/navigation";
import { RequirementConfirmationClient } from "./requirement-confirmation-client";

export default function RequirementConfirmationPage() {
	const params = useParams();
	const draftId = String(params.draft_id || "");

	return <RequirementConfirmationClient draftId={draftId} />;
}
