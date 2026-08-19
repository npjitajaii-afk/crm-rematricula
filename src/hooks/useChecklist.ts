import { useContext } from "react";
import { ChecklistContextType } from "../types";
import { ChecklistContext } from "../contexts/checklist-context";

export const useChecklist = (): ChecklistContextType => {
  const context = useContext(ChecklistContext);
  if (!context) {
    throw new Error("useChecklist must be used within a ChecklistProvider");
  }
  return context;
};
