// =====================
// StudySync – data.js
// Default data & constants
// =====================

const LEVELS = [
  { name: 'Getting Started',  xp: 0    },
  { name: 'Rising Scholar',   xp: 100  },
  { name: 'Study Pro',        xp: 250  },
  { name: 'Knowledge Seeker', xp: 500  },
  { name: 'Academic Elite',   xp: 1000 },
];

const BADGE_DEFS = [
  {
    id: 'first_hw',
    icon: '⭐',
    name: 'First Steps',
    desc: 'Complete your first homework',
    check: s => s.hwDone >= 1,
  },
  {
    id: 'week_warrior',
    icon: '🔥',
    name: 'Week Warrior',
    desc: 'Maintain a 7-day streak',
    check: s => s.streak >= 7,
  },
  {
    id: 'five_assign',
    icon: '🎓',
    name: 'Assignment Ace',
    desc: 'Complete 5 assignments',
    check: s => s.assignDone >= 5,
  },
  {
    id: 'ten_hw',
    icon: '💪',
    name: 'Homework Hero',
    desc: 'Complete 10 homework tasks',
    check: s => s.hwDone >= 10,
  },
  {
    id: 'first_replay',
    icon: '🧠',
    name: 'Memory Maker',
    desc: 'Answer your first replay question',
    check: s => s.replaysAnswered >= 1,
  },
];

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const DEFAULT_STATE = {
  classes: [
    { id: 1,  subject: 'English',   day: 'Monday',    time: '08:30 - 09:25', room: 'B12',  teacher: 'Ms Thompson' },
    { id: 2,  subject: 'Maths',     day: 'Monday',    time: '09:25 - 10:20', room: 'A04',  teacher: 'Mr Patel'    },
    { id: 3,  subject: 'Science',   day: 'Monday',    time: '10:20 - 11:15', room: 'C09',  teacher: 'Mrs Clarke'  },
    { id: 4,  subject: 'History',   day: 'Monday',    time: '11:30 - 12:25', room: 'B06',  teacher: 'Mr Davis'    },
    { id: 5,  subject: 'PE',        day: 'Monday',    time: '13:15 - 14:10', room: 'Gym',  teacher: 'Mr Wilson'   },
    { id: 6,  subject: 'Maths',     day: 'Tuesday',   time: '08:30 - 09:25', room: 'A04',  teacher: 'Mr Patel'    },
    { id: 7,  subject: 'Art',       day: 'Tuesday',   time: '09:25 - 10:20', room: 'D01',  teacher: 'Ms Lee'      },
    { id: 8,  subject: 'English',   day: 'Tuesday',   time: '10:20 - 11:15', room: 'B12',  teacher: 'Ms Thompson' },
    { id: 9,  subject: 'Geography', day: 'Tuesday',   time: '11:30 - 12:25', room: 'B08',  teacher: 'Mr Brown'    },
    { id: 10, subject: 'Science',   day: 'Wednesday', time: '08:30 - 09:25', room: 'C09',  teacher: 'Mrs Clarke'  },
    { id: 11, subject: 'Maths',     day: 'Wednesday', time: '09:25 - 10:20', room: 'A04',  teacher: 'Mr Patel'    },
    { id: 12, subject: 'History',   day: 'Wednesday', time: '10:20 - 11:15', room: 'B06',  teacher: 'Mr Davis'    },
    { id: 13, subject: 'English',   day: 'Thursday',  time: '08:30 - 09:25', room: 'B12',  teacher: 'Ms Thompson' },
    { id: 14, subject: 'Geography', day: 'Thursday',  time: '09:25 - 10:20', room: 'B08',  teacher: 'Mr Brown'    },
    { id: 15, subject: 'PE',        day: 'Thursday',  time: '10:20 - 11:15', room: 'Gym',  teacher: 'Mr Wilson'   },
    { id: 16, subject: 'Art',       day: 'Friday',    time: '08:30 - 09:25', room: 'D01',  teacher: 'Ms Lee'      },
    { id: 17, subject: 'Science',   day: 'Friday',    time: '09:25 - 10:20', room: 'C09',  teacher: 'Mrs Clarke'  },
    { id: 18, subject: 'Maths',     day: 'Friday',    time: '10:20 - 11:15', room: 'A04',  teacher: 'Mr Patel'    },
  ],
  homework: [
    { id: 101, subject: 'Maths',     desc: 'Complete Page 42 Questions 1–20',              due: '2026-06-03', priority: 'high',   time: 25, done: false },
    { id: 102, subject: 'History',   desc: 'Read Chapter 6 and answer review questions',   due: '2026-06-04', priority: 'medium', time: 30, done: false },
    { id: 103, subject: 'English',   desc: 'Write a 500-word essay on climate change',     due: '2026-06-05', priority: 'high',   time: 60, done: false },
    { id: 104, subject: 'Geography', desc: 'Map labelling exercise – rivers of Europe',    due: '2026-06-07', priority: 'low',    time: 20, done: false },
    { id: 105, subject: 'Science',   desc: 'Research project introduction draft',          due: '2026-06-09', priority: 'medium', time: 40, done: false },
  ],
  assignments: [
    {
      id: 201,
      subject: 'Maths',
      title: 'Maths Exam Preparation',
      desc: 'Prepare for the end-of-term mathematics examination',
      due: '2026-06-14',
      stages: ['Research', 'Draft', 'Final Version', 'Submit'],
      progress: 2,
    },
    {
      id: 202,
      subject: 'Science',
      title: 'Science Research Project',
      desc: 'Research a topic of your choice in modern biology',
      due: '2026-06-16',
      stages: ['Research', 'Draft', 'Final Version', 'Submit'],
      progress: 1,
    },
    {
      id: 203,
      subject: 'History',
      title: 'History Essay – World War II',
      desc: 'Analyze the causes and effects of World War II',
      due: '2026-06-23',
      stages: ['Research', 'Draft', 'Final Version', 'Submit'],
      progress: 0,
    },
  ],
  replay: [
    { id: 301, subject: 'Maths',   question: 'What is 3/4 + 1/2?',                  answers: ['5/4 (or 1¼)', '1/4', '3/8'],  correct: 0, answered: null },
    { id: 302, subject: 'Science', question: 'What is the chemical symbol for water?', answers: ['H₂O', 'CO₂', 'O₂'],          correct: 0, answered: null },
    { id: 303, subject: 'History', question: 'When did World War II end?',            answers: ['1945', '1939', '1918'],        correct: 0, answered: null },
  ],
  xp: 140,
  streak: 8,
  hwDone: 14,
  assignDone: 3,
  replaysAnswered: 1,
  earnedBadges: ['first_hw', 'week_warrior'],
  hwFilter: 'active',
  hasCompletedSetup: false,
  nextId: 400,
};
