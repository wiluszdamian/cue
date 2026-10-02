/** Buttons with data-copy="<id>" copy that element's text and flash a done state. */
export function initCopyButtons(): void {
  document.querySelectorAll<HTMLElement>('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const el = document.getElementById(btn.dataset.copy ?? '');
      if (!el) return;
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      navigator.clipboard.writeText(text).then(
        () => {
          btn.classList.add('done');
          setTimeout(() => btn.classList.remove('done'), 1800);
        },
        () => selectText(el),
      );
    });
  });
}

function selectText(el: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}
