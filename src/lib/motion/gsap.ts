import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';

// The one place that imports GSAP: registered once per load, no plugins
gsap.registerPlugin(useGSAP);

export { gsap, useGSAP };
