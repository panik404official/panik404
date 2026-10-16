import img0 from '../assets/journals/addiction-recovery-journal.jpg';
import img1 from '../assets/journals/breakup-recovery-journal.jpg';
import img2 from '../assets/journals/overthinking-reset-journal.jpg';

export const P = [
  {
    id: 'addiction-recovery-journal',
    name: 'Addiction Recovery Journal',
    price: 3995,
    pop: 3,
    rate: 4.6,
    new: 1,
    hook: 'You Said “This Is the Last Time”… So Why Are You Here Again?',
    body: [
      'Maybe you’ve tried quitting. Deleting the app. Avoiding the trigger. Promising yourself you’ll do better tomorrow. And somehow, you end up back in the same place.',
      'This journal isn’t here to tell you to “just stop.” It’s here to help you understand why the cycle keeps happening in the first place.',
      'Using guided exercises inspired by NLP (Neuro-Linguistic Programming) techniques, you’ll explore the triggers, thoughts, emotions, and patterns that may be keeping you stuck, so you can become more aware of what keeps pulling you back.',
      'The journal helps you slow down, notice your patterns, and create more space between an urge and your next decision.',
      'No lectures. No judgment. No pretending change is easy. Just you, a pen, and some questions you may have never asked yourself before.',
      'Maybe the real question isn’t “Why can’t I stop?” Maybe it’s “What keeps bringing me back?”',
    ],
  },
  {
    id: 'breakup-recovery-journal',
    name: 'Breakup Recovery Journal',
    price: 3999,
    pop: 2,
    rate: 4.8,
    new: 2,
    hook: '“You Need to Move On”… But What If You Don’t Even Know What You’re Feeling Yet?',
    body: [
      'People may tell you to let go, stop thinking about them, or “just move on.” But only you know what it feels like when the memories come back, or when you can’t even explain why it still hurts.',
      'The 30-Day Breakup Recovery Journal gives you a private space to process what you’re actually feeling without forcing yourself to be okay before you’re ready.',
      'Using guided exercises inspired by Acceptance and Commitment Therapy (ACT), it helps you notice difficult thoughts and emotions without letting them control every decision, and reconnect with the values, needs, and life that matter to you.',
      'You don’t have to erase the past. You just need a safe place to be honest with yourself and slowly learn how to carry the pain differently.',
      'Maybe healing isn’t about forgetting them. Maybe it’s about finding yourself again.',
    ],
  },
  {
    id: 'overthinking-reset-journal',
    name: 'Overthinking Reset Journal',
    price: 3850,
    pop: 1,
    rate: 4.7,
    new: 3,
    hook: 'Ever replayed one conversation 20 times in your head?',
    body: [
      'Overanalyzed a text? Made up 10 different scenarios before anything even happened? Overthinking can make even small things feel exhausting.',
      'The Overthinking Reset Journal is designed to help you slow that cycle down.',
      'Using guided exercises inspired by Cognitive Behavioral Therapy (CBT), it helps you notice unhelpful thought patterns, question the stories your mind creates, and look at situations with more clarity and balance.',
      'It’s not about “just thinking positive.” It’s about learning how to stop giving every thought so much power.',
      'Sometimes the problem isn’t what happened, it’s everything your mind added after.',
    ],
  },
];

const IMGS = {
  'addiction-recovery-journal': img0,
  'breakup-recovery-journal': img1,
  'overthinking-reset-journal': img2,
};
P.forEach((p) => {
  p.img = IMGS[p.id];
});

export const SORTS = [
  ['', 'Default sorting'],
  ['popularity', 'Sort by popularity'],
  ['rating', 'Sort by average rating'],
  ['latest', 'Sort by latest'],
  ['price-low', 'Sort by price: low to high'],
  ['price-high', 'Sort by price: high to low'],
];
export const sortFn = {
  '': (a, b) => 0,
  popularity: (a, b) => a.pop - b.pop,
  rating: (a, b) => b.rate - a.rate,
  latest: (a, b) => a.new - b.new,
  'price-low': (a, b) => a.price - b.price,
  'price-high': (a, b) => b.price - a.price,
};
