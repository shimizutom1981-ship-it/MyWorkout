# MyWorkout

A single-page workout tracker. Open `index.html` in a browser or serve this folder with any static HTTP server.

Workout records and exercise/mode-specific inputs are saved in the browser's `myWorkout_v1` localStorage entry. Recording a set keeps its weight and reps selected for the next set. Each exercise shows its five most recent records; older records remain stored and included in backups.

## Regression tests

With Node.js 18 or newer, run:

```sh
node --test tests/workout.test.cjs
```

The tests use synthetic data in an isolated in-memory browser-state harness. They do not access real workout data.
