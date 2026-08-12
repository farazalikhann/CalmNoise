/**
 * AudioWorkletProcessor that generates white, pink, or brown noise entirely
 * in the audio rendering thread — no audio files needed.
 *
 * Pink noise uses the Paul Kellet "refined" approximation of 1/f filtering.
 * Brown noise uses a leaky integrator (random walk) on white noise.
 */
class NoiseProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.type = (options && options.processorOptions && options.processorOptions.type) || 'white';

    // Brown noise state
    this.lastOut = 0;

    // Pink noise filter state (Paul Kellet's method)
    this.b0 = 0;
    this.b1 = 0;
    this.b2 = 0;
    this.b3 = 0;
    this.b4 = 0;
    this.b5 = 0;
    this.b6 = 0;
  }

  process(_inputs, outputs) {
    const output = outputs[0];

    for (let channel = 0; channel < output.length; channel++) {
      const data = output[channel];

      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        let sample;

        if (this.type === 'pink') {
          this.b0 = 0.99886 * this.b0 + white * 0.0555179;
          this.b1 = 0.99332 * this.b1 + white * 0.0750759;
          this.b2 = 0.969 * this.b2 + white * 0.153852;
          this.b3 = 0.8665 * this.b3 + white * 0.3104856;
          this.b4 = 0.55 * this.b4 + white * 0.5329522;
          this.b5 = -0.7616 * this.b5 - white * 0.016898;
          sample = this.b0 + this.b1 + this.b2 + this.b3 + this.b4 + this.b5 + this.b6 + white * 0.5362;
          this.b6 = white * 0.115926;
          sample *= 0.11;
        } else if (this.type === 'brown') {
          sample = (this.lastOut + 0.02 * white) / 1.02;
          this.lastOut = sample;
          sample *= 3.5;
        } else {
          sample = white * 0.9;
        }

        // Safety clamp — keeps the signal in range regardless of filter drift.
        data[i] = Math.max(-1, Math.min(1, sample));
      }
    }

    return true;
  }
}

registerProcessor('noise-processor', NoiseProcessor);
