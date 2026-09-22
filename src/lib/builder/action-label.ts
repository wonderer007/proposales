/**
 * What the builder's primary button does, given the inquiry's active proposal
 * (SPEC §4.4). Pure, so the label and the branch in D11 stay in step.
 */
export type ProposalAction = "create" | "patch" | "version";

export function proposalAction(activeStatus: string | null | undefined): ProposalAction {
  if (!activeStatus) return "create";

  // Only an unsent draft can be edited in place; anything else has been seen
  // by the customer, so a change becomes a new version.
  return activeStatus === "draft" || activeStatus === "template" ? "patch" : "version";
}

export function proposalActionLabel(action: ProposalAction): string {
  switch (action) {
    case "create":
      return "Create proposal";
    case "patch":
      return "Update draft";
    case "version":
      return "Create new version";
  }
}
