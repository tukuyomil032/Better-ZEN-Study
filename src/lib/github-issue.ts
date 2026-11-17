// Fills in the new-issue page of the project, on the page itself. The function is injected into the
// GitHub tab with scripting.executeScript, so it must not refer to anything outside its own body:
// no imports, no closures. It is typed here so the background and the tests can use the same shape.

// Whether the settings page must open the issue tab itself. The background opens it whenever it can
// reach the issue form, so a second tab is needed only when the background did not open one.
export function shouldOpenIssueTab(
  response: { ok: boolean; opened?: boolean } | undefined,
): boolean {
  return !(response?.ok === true && response.opened === true);
}

export type IssueAttachment = { name: string; content: string; type: string };
export type IssueDraft = { title: string; body: string; attachments: IssueAttachment[] };
export type FillResult = { filled: boolean; attached: number; reason?: string };

export function fillIssueForm(draft: IssueDraft): FillResult {
  const titleInput = document.querySelector<HTMLInputElement>(
    'input[name="issue[title]"], #issue_title',
  );
  const bodyInput = document.querySelector<HTMLTextAreaElement>(
    'textarea[name="issue[body]"], #issue_body',
  );
  if (!titleInput || !bodyInput) return { filled: false, attached: 0, reason: "form-not-found" };

  // Setting the value through the prototype's setter, then firing input and change, makes the page's
  // own components see the new text, as if it had been typed.
  const setValue = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  };
  setValue(titleInput, draft.title);
  setValue(bodyInput, draft.body);

  // The page takes uploads when files are dropped on the description. Whether GitHub accepts a
  // drop that did not come from the browser's own drag is not guaranteed; the caller says so.
  let attached = 0;
  for (const attachment of draft.attachments) {
    try {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([attachment.content], attachment.name, { type: attachment.type }),
      );
      bodyInput.dispatchEvent(
        new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true }),
      );
      attached += 1;
    } catch {
      // Leave the rest of the form as it is; the person can still drop the file by hand.
    }
  }

  const banner = document.createElement("div");
  banner.setAttribute("role", "status");
  banner.textContent =
    "Better ZEN Study が入力しました。内容を確認して、Submit new issue を押してください。";
  Object.assign(banner.style, {
    position: "fixed",
    right: "16px",
    bottom: "16px",
    zIndex: "2147483647",
    padding: "10px 14px",
    borderRadius: "10px",
    background: "#0b5cad",
    color: "#fff",
    font: "14px/1.5 system-ui, sans-serif",
    boxShadow: "0 6px 20px rgba(0,0,0,.25)",
  });
  document.body.appendChild(banner);
  return { filled: true, attached };
}
