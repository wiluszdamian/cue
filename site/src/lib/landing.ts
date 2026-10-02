const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Pencil corrections draw in when scrolled to. They start drawn, so the page is
 * complete without script; the observer only replays them.
 */
export function initCorrections(): void {
  const marks = document.querySelectorAll<HTMLElement>('[data-reveal]');
  if (reduced() || !('IntersectionObserver' in window)) {
    marks.forEach((m) => m.classList.remove('pending'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        setTimeout(() => entry.target.classList.remove('pending'), 150);
        io.unobserve(entry.target);
      }
    },
    { threshold: 0.6 },
  );
  marks.forEach((m) => io.observe(m));
}

const CARET = '<span class="caret" aria-hidden="true"></span>';
const PROMPT = '<span class="t-prompt">❯</span> ';

/**
 * Hero terminal: commands type out, output lands line by line, and the cue light
 * holds on standby while a command is typed and goes green when it runs.
 */
export function initHeroTerminal(): void {
  const screen = document.getElementById('hero-screen');
  const bar = document.getElementById('bar');
  const pill = document.getElementById('cue-pill');
  const pillText = document.getElementById('cue-state');
  const replay = document.getElementById('replay');
  if (!screen || !bar || !pill || !pillText || !replay) return;

  const lines = screen.innerHTML.split('\n');
  let timer: ReturnType<typeof setTimeout> | undefined;

  const setCue = (go: boolean) => {
    pill.classList.toggle('go', go);
    bar.classList.toggle('go', go);
    pillText.textContent = go ? 'go' : 'standby';
  };

  const play = () => {
    clearTimeout(timer);
    screen.style.minHeight = `${screen.offsetHeight}px`;
    const done: string[] = [];
    let i = 0;
    setCue(false);

    const nextLine = () => {
      if (i >= lines.length) {
        screen.innerHTML = `${done.join('\n')}\n\n${PROMPT}${CARET}`;
        setCue(true);
        return;
      }
      const line = lines[i++] ?? '';
      const cmd = /<span class="t-cmd">([^<]*)<\/span>/.exec(line);
      if (!cmd) {
        done.push(line);
        screen.innerHTML = done.join('\n') + CARET;
        timer = setTimeout(nextLine, line.trim() === '' ? 420 : 120);
        return;
      }
      setCue(false);
      const text = cmd[1] ?? '';
      let n = 0;
      const typeChar = () => {
        const before = done.length > 0 ? `${done.join('\n')}\n` : '';
        screen.innerHTML = `${before}${PROMPT}<span class="t-cmd">${text.slice(0, n)}</span>${CARET}`;
        if (n++ < text.length) {
          timer = setTimeout(typeChar, 22 + Math.random() * 40);
        } else {
          done.push(line);
          timer = setTimeout(() => {
            setCue(true);
            nextLine();
          }, 380);
        }
      };
      typeChar();
    };
    nextLine();
  };

  replay.addEventListener('click', () => {
    if (!reduced()) play();
  });
  if (reduced()) setCue(true);
  else setTimeout(play, 500);
}
