// ---------------------------------------------------------------------
// Som de notificação (toque tipo "ding" de dois tons), gerado via Web
// Audio API — sem precisar de nenhum arquivo .mp3/.wav externo.
//
// Preferência de mudo fica salva no localStorage, então persiste entre
// sessões e pode ser lida por qualquer componente (ex.: botão no sino).
// ---------------------------------------------------------------------

const STORAGE_KEY = "crm:notificacao-som-mudo";

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;

  const AudioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioContextClass) return null;

  if (!audioCtx) {
    audioCtx = new AudioContextClass();
  }
  return audioCtx;
}

export function isSomNotificacaoMudo(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSomNotificacaoMudo(mudo: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, mudo ? "1" : "0");
  } catch {
    // localStorage indisponível (modo privado etc.) — ignora silenciosamente.
  }
}

function tocarTom(
  ctx: AudioContext,
  frequencia: number,
  inicioSegundos: number,
  duracaoSegundos: number
) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = frequencia;

  const inicio = ctx.currentTime + inicioSegundos;
  const fim = inicio + duracaoSegundos;

  // Envelope suave (evita "clique" no início/fim do tom).
  gain.gain.setValueAtTime(0, inicio);
  gain.gain.linearRampToValueAtTime(0.15, inicio + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, fim);

  oscillator.connect(gain);
  gain.connect(ctx.destination);

  oscillator.start(inicio);
  oscillator.stop(fim + 0.02);
}

// Toca o som de notificação, a não ser que o usuário tenha mutado.
// Falha silenciosamente se o navegador bloquear áudio (política de
// autoplay) — nunca deve quebrar o fluxo de notificações.
export function playNotificationSound(): void {
  if (isSomNotificacaoMudo()) return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {
        /* ignora — navegador ainda não liberou áudio */
      });
    }

    // Dois tons curtos (dó -> mi), toque leve de "ding".
    tocarTom(ctx, 880, 0, 0.12);
    tocarTom(ctx, 1174.66, 0.1, 0.18);
  } catch {
    // Nunca deixa o som quebrar a experiência de notificações.
  }
}
