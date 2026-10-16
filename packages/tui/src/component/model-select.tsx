import { DialogVariant } from "./dialog-variant"
import { useDialog } from "../ui/dialog"
import { useLocal } from "../context/local"

// Shared select-and-confirm flow for model picks. Every model selection
// goes through local.model.set (keeps precedence/persistence correct),
// then routes to the variant picker only when the new model needs one.
// Same behavior as DialogOnboarding's OnboardingConfirm picks.
export function useSelectModel() {
  const dialog = useDialog()
  const local = useLocal()
  return (providerID: string, modelID: string) => {
    local.model.set({ providerID, modelID }, { recent: true })
    if (local.model.variant.list().length > 0 && !local.model.variant.current()) {
      dialog.replace(() => <DialogVariant />)
      return
    }
    dialog.clear()
  }
}
