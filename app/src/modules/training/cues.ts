/**
 * Avisos de los intervalos: un pitido, vibración y, si está prendida la voz,
 * el nombre de la etapa. Todo es opcional y falla en silencio (el navegador
 * puede bloquear el sonido hasta que la persona toque la pantalla).
 */
let ctx: AudioContext | null = null;

export function beep(freq = 880, ms = 150): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    gain.gain.value = 0.2;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + ms / 1000);
  } catch {
    /* sin sonido */
  }
}

export function buzz(pattern: number | number[] = 200): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* sin vibración */
  }
}

export function say(text: string, lang: string): void {
  try {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    window.speechSynthesis.speak(u);
  } catch {
    /* sin voz */
  }
}
