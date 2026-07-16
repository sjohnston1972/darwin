export interface WeightedOption<T> {
  value: T;
  weight: number;
}

export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }

  integer(min: number, max: number) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  chance(probability: number) {
    return this.next() < probability;
  }

  pick<T>(values: readonly T[]): T {
    if (values.length === 0)
      throw new Error('Cannot choose from an empty list.');
    return values[this.integer(0, values.length - 1)]!;
  }

  weighted<T>(options: readonly WeightedOption<T>[]): T {
    const total = options.reduce((sum, option) => sum + option.weight, 0);
    if (total <= 0)
      throw new Error('Weighted options must have positive weight.');

    let cursor = this.next() * total;
    for (const option of options) {
      cursor -= option.weight;
      if (cursor < 0) return option.value;
    }

    return options[options.length - 1]!.value;
  }
}
