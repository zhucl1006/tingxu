export class InterimTextStabilizer {
  private characters: Array<{ char: string; since: number; observations: number }> = [];

  update(text: string, now: number): { stable: string; unstable: string } {
    let samePrefix = true;
    this.characters = Array.from(text).map((char, i) => {
      const previous = this.characters[i];
      samePrefix = samePrefix && previous?.char === char;
      return samePrefix ? { ...previous, observations: previous.observations + 1 } : { char, since: now, observations: 1 };
    });
    let count = 0;
    for (const item of this.characters) {
      if (item.observations < 2 || now - item.since < 350) break;
      count++;
    }
    return { stable: this.characters.slice(0, count).map(x => x.char).join(''), unstable: this.characters.slice(count).map(x => x.char).join('') };
  }
  reset(): void { this.characters = []; }
}
