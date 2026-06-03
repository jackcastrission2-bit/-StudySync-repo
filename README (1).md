# StudySync – Smart Student Diary 📚

A digital student diary that combines a timetable, homework planner, assignment tracker, replay (spaced-repetition) system, and rewards — all in one place, with no build step required.

![StudySync Dashboard](https://via.placeholder.com/800x400?text=StudySync+Dashboard)

---

## Features

| Section | What it does |
|---|---|
| **Dashboard** | Today's classes, priority homework, streak, and stats at a glance |
| **Timetable** | Weekly Mon–Fri schedule with room numbers and teachers |
| **Homework** | Add tasks with priority, due dates, and time estimates; mark complete for XP |
| **Assignments** | Track multi-stage projects with progress bars |
| **Replay** | Spaced-repetition flashcard-style questions to reinforce learning |
| **Rewards** | XP levels, streaks, and badges earned automatically |

---

## Getting Started

No build tools, no dependencies to install. Just open the file:

```bash
git clone https://github.com/YOUR_USERNAME/studysync.git
cd studysync
open index.html       # macOS
# or
start index.html      # Windows
# or
xdg-open index.html   # Linux
```

> Data is saved to `localStorage` automatically — your homework, classes, and XP persist between sessions.

---

## Project Structure

```
studysync/
├── index.html        # App shell & all markup (pages, modals)
├── src/
│   ├── style.css     # All styles (CSS variables, components, layout)
│   ├── data.js       # Default data, constants (LEVELS, BADGE_DEFS, DEFAULT_STATE)
│   └── app.js        # All application logic (state, rendering, actions)
└── README.md
```

No frameworks, no bundlers — plain HTML, CSS, and vanilla JS.

---

## XP System

| Action | XP earned |
|---|---|
| Complete a homework task | +10 XP |
| Advance an assignment stage | +15 XP |
| Complete an assignment | +25 XP bonus |
| Answer a replay question correctly | +5 XP |

### Levels

| Level | Name | XP needed |
|---|---|---|
| 1 | Getting Started | 0 |
| 2 | Rising Scholar | 100 |
| 3 | Study Pro | 250 |
| 4 | Knowledge Seeker | 500 |
| 5 | Academic Elite | 1000 |

---

## Roadmap / Future Ideas

- [ ] AI Homework Helper (upload a question, get an explanation)
- [ ] Smart Study Planner (enter exam date → auto-generate schedule)
- [ ] Note-taking with image/PDF upload
- [ ] Shared Notes (rate and save other students' notes)
- [ ] Teacher view (homework completion rates, resource uploads)
- [ ] Parent view (missing homework, upcoming assessments)
- [ ] PWA / offline support
- [ ] Dark mode

---

## Contributing

1. Fork the repo
2. Create a branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m "Add my feature"`
4. Push and open a pull request

---

## License

MIT — use it, remix it, build on it.
