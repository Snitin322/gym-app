import type { WorkoutExerciseKind } from '@onthec/shared'

/**
 * Common gym exercises a new gym can add to its library in one tap. Names are unique per gym,
 * so adding them again (or after the gym added some of its own) skips the ones already there.
 */
export const STARTER_EXERCISES: {
  name: string
  muscleGroup: string
  kind: WorkoutExerciseKind
  description: string
}[] = [
  // Chest
  {
    name: 'Barbell Bench Press',
    muscleGroup: 'Chest',
    kind: 'strength',
    description:
      'Lie flat, grip slightly wider than shoulders, lower the bar to mid-chest and press up. Keep feet flat and shoulder blades pulled back.',
  },
  {
    name: 'Incline Dumbbell Press',
    muscleGroup: 'Chest',
    kind: 'strength',
    description:
      'Bench at 30–45°. Press dumbbells up over the upper chest, lower slowly until elbows are just below the bench.',
  },
  {
    name: 'Decline Bench Press',
    muscleGroup: 'Chest',
    kind: 'strength',
    description: 'Bench declined, feet locked. Lower the bar to the lower chest and press up.',
  },
  {
    name: 'Dumbbell Flyes',
    muscleGroup: 'Chest',
    kind: 'strength',
    description: 'Lie flat, arms slightly bent, open the arms wide in an arc and squeeze back together over the chest.',
  },
  {
    name: 'Cable Crossover',
    muscleGroup: 'Chest',
    kind: 'strength',
    description:
      'Stand between the cables, step forward, bring the handles together in front of the chest with a slight bend in the elbows.',
  },
  {
    name: 'Push-ups',
    muscleGroup: 'Chest',
    kind: 'strength',
    description:
      'Hands under shoulders, body in a straight line, lower the chest to just above the floor and push back up.',
  },
  {
    name: 'Pec Deck',
    muscleGroup: 'Chest',
    kind: 'strength',
    description: 'Sit upright, bring the pads together in front of the chest, return slowly.',
  },
  // Back
  {
    name: 'Deadlift',
    muscleGroup: 'Back',
    kind: 'strength',
    description:
      'Feet hip-width, bar over mid-foot. Flat back, push through the floor and stand tall; lower with control.',
  },
  {
    name: 'Lat Pulldown',
    muscleGroup: 'Back',
    kind: 'strength',
    description: 'Wide grip, lean back slightly, pull the bar to the upper chest by driving elbows down.',
  },
  {
    name: 'Pull-ups',
    muscleGroup: 'Back',
    kind: 'strength',
    description: 'Hang with arms straight, pull until the chin is over the bar, lower fully.',
  },
  {
    name: 'Barbell Row',
    muscleGroup: 'Back',
    kind: 'strength',
    description: 'Hinge forward with a flat back, pull the bar to the lower ribs, lower slowly.',
  },
  {
    name: 'Seated Cable Row',
    muscleGroup: 'Back',
    kind: 'strength',
    description: 'Sit tall, pull the handle to the stomach squeezing shoulder blades together, return with control.',
  },
  {
    name: 'Single-arm Dumbbell Row',
    muscleGroup: 'Back',
    kind: 'strength',
    description: 'One knee and hand on the bench, pull the dumbbell to the hip, keep the back flat.',
  },
  {
    name: 'T-bar Row',
    muscleGroup: 'Back',
    kind: 'strength',
    description: 'Chest up, hinge forward, pull the handle to the chest.',
  },
  {
    name: 'Back Extension',
    muscleGroup: 'Back',
    kind: 'strength',
    description: 'On the hyperextension bench, lower the upper body and raise until the body is straight.',
  },
  // Shoulders
  {
    name: 'Overhead Press',
    muscleGroup: 'Shoulders',
    kind: 'strength',
    description: 'Standing or seated, press the bar or dumbbells from shoulder height to overhead; brace the core.',
  },
  {
    name: 'Dumbbell Lateral Raise',
    muscleGroup: 'Shoulders',
    kind: 'strength',
    description: 'Raise the dumbbells out to the sides to shoulder height, elbows slightly bent, lower slowly.',
  },
  {
    name: 'Front Raise',
    muscleGroup: 'Shoulders',
    kind: 'strength',
    description: 'Raise the weight straight in front to shoulder height, lower with control.',
  },
  {
    name: 'Rear Delt Fly',
    muscleGroup: 'Shoulders',
    kind: 'strength',
    description: 'Bent over or on the pec deck reversed, open the arms out to the sides squeezing the rear shoulders.',
  },
  {
    name: 'Face Pull',
    muscleGroup: 'Shoulders',
    kind: 'strength',
    description: 'Rope at face height, pull towards the face with elbows high, squeeze the upper back.',
  },
  {
    name: 'Barbell Shrug',
    muscleGroup: 'Shoulders',
    kind: 'strength',
    description: 'Hold the bar at arm’s length, lift the shoulders straight up towards the ears, lower slowly.',
  },
  // Biceps
  {
    name: 'Barbell Curl',
    muscleGroup: 'Biceps',
    kind: 'strength',
    description: 'Elbows at the sides, curl the bar to the shoulders, lower fully without swinging.',
  },
  {
    name: 'Dumbbell Curl',
    muscleGroup: 'Biceps',
    kind: 'strength',
    description: 'Curl the dumbbells, turning palms up as they rise; lower slowly.',
  },
  {
    name: 'Hammer Curl',
    muscleGroup: 'Biceps',
    kind: 'strength',
    description: 'Palms facing each other, curl the dumbbells to the shoulders.',
  },
  {
    name: 'Preacher Curl',
    muscleGroup: 'Biceps',
    kind: 'strength',
    description: 'Arms on the preacher pad, curl up and lower until the arms are almost straight.',
  },
  {
    name: 'Cable Curl',
    muscleGroup: 'Biceps',
    kind: 'strength',
    description: 'Facing the low cable, curl the bar up keeping the elbows still.',
  },
  // Triceps
  {
    name: 'Triceps Pushdown',
    muscleGroup: 'Triceps',
    kind: 'strength',
    description: 'Elbows at the sides, push the rope or bar down until the arms are straight, return slowly.',
  },
  {
    name: 'Overhead Triceps Extension',
    muscleGroup: 'Triceps',
    kind: 'strength',
    description: 'Hold a dumbbell overhead with both hands, lower behind the head and extend back up.',
  },
  {
    name: 'Skull Crushers',
    muscleGroup: 'Triceps',
    kind: 'strength',
    description: 'Lying flat, lower the bar towards the forehead by bending the elbows, extend back up.',
  },
  {
    name: 'Close-grip Bench Press',
    muscleGroup: 'Triceps',
    kind: 'strength',
    description: 'Hands shoulder-width on the bar, elbows close to the body, press up.',
  },
  {
    name: 'Bench Dips',
    muscleGroup: 'Triceps',
    kind: 'strength',
    description: 'Hands on a bench behind you, lower the body by bending the elbows, push back up.',
  },
  // Legs and glutes
  {
    name: 'Barbell Squat',
    muscleGroup: 'Legs',
    kind: 'strength',
    description:
      'Bar on the upper back, feet shoulder-width, sit down until thighs are parallel, drive up through the heels.',
  },
  {
    name: 'Leg Press',
    muscleGroup: 'Legs',
    kind: 'strength',
    description: 'Feet shoulder-width on the plate, lower until knees are at 90°, press without locking the knees.',
  },
  {
    name: 'Walking Lunges',
    muscleGroup: 'Legs',
    kind: 'strength',
    description: 'Step forward and lower the back knee towards the floor, push up and step through with the other leg.',
  },
  {
    name: 'Romanian Deadlift',
    muscleGroup: 'Legs',
    kind: 'strength',
    description:
      'Slight knee bend, hinge at the hips lowering the bar along the legs until the hamstrings stretch, stand up.',
  },
  {
    name: 'Leg Extension',
    muscleGroup: 'Legs',
    kind: 'strength',
    description: 'Seated, straighten the legs against the pad, lower slowly.',
  },
  {
    name: 'Leg Curl',
    muscleGroup: 'Legs',
    kind: 'strength',
    description: 'Lying or seated, curl the heels towards the glutes, return with control.',
  },
  {
    name: 'Standing Calf Raise',
    muscleGroup: 'Legs',
    kind: 'strength',
    description: 'Rise onto the toes as high as possible, pause, lower the heels below the step.',
  },
  {
    name: 'Goblet Squat',
    muscleGroup: 'Legs',
    kind: 'strength',
    description: 'Hold a dumbbell at the chest, squat down keeping the chest up.',
  },
  {
    name: 'Hip Thrust',
    muscleGroup: 'Glutes',
    kind: 'strength',
    description: 'Upper back on a bench, bar over the hips, drive the hips up and squeeze the glutes at the top.',
  },
  // Core
  {
    name: 'Plank',
    muscleGroup: 'Core',
    kind: 'strength',
    description: 'On forearms and toes, body in a straight line, hold without letting the hips drop.',
  },
  {
    name: 'Crunches',
    muscleGroup: 'Core',
    kind: 'strength',
    description: 'Lying on the back, knees bent, curl the shoulders off the floor, lower slowly.',
  },
  {
    name: 'Hanging Leg Raise',
    muscleGroup: 'Core',
    kind: 'strength',
    description: 'Hang from a bar, raise the legs to hip height or higher without swinging.',
  },
  {
    name: 'Russian Twist',
    muscleGroup: 'Core',
    kind: 'strength',
    description: 'Seated, lean back slightly, rotate the torso side to side, with or without a weight.',
  },
  {
    name: 'Cable Woodchopper',
    muscleGroup: 'Core',
    kind: 'strength',
    description: 'Pull the cable diagonally across the body, rotating through the torso.',
  },
  // Cardio
  {
    name: 'Treadmill',
    muscleGroup: 'Cardio',
    kind: 'cardio',
    description: 'Walk or run; set speed and incline as noted.',
  },
  {
    name: 'Cycling (stationary bike)',
    muscleGroup: 'Cardio',
    kind: 'cardio',
    description: 'Steady pace or intervals; set the level as noted.',
  },
  {
    name: 'Cross Trainer',
    muscleGroup: 'Cardio',
    kind: 'cardio',
    description: 'Smooth strides using both arms and legs; set the level as noted.',
  },
  {
    name: 'Rowing Machine',
    muscleGroup: 'Cardio',
    kind: 'cardio',
    description: 'Push with the legs first, then lean back and pull the handle to the lower chest.',
  },
  {
    name: 'Stair Climber',
    muscleGroup: 'Cardio',
    kind: 'cardio',
    description: 'Steady steps, stand tall without leaning on the rails.',
  },
  {
    name: 'Skipping Rope',
    muscleGroup: 'Cardio',
    kind: 'cardio',
    description: 'Light jumps on the balls of the feet, turning the rope with the wrists.',
  },
]
