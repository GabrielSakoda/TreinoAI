import { WeekDay } from "../generated/prisma/enums.js";
import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
  active?: boolean;
}

interface OutputDto {
  id: string;
  name: string;
  isActive: boolean;
  workoutDays: Array<{
    id: string;
    name: string;
    weekDay: WeekDay;
    isRest: boolean;
    coverImageUrl?: string;
    estimatedDurationInSeconds: number;
    exercises: Array<{
      id: string;
      name: string;
      order: number;
      sets: number;
      reps: number;
      restTimeInSeconds: number;
    }>;
  }>;
}

export class GetWorkoutPlans {
  async execute(dto: InputDto): Promise<OutputDto[]> {
    const whereClause: { userId: string; isActive?: boolean } = {
      userId: dto.userId,
    };

    if (dto.active !== undefined) {
      whereClause.isActive = dto.active;
    }

    const workoutPlans = await prisma.workoutPlan.findMany({
      where: whereClause,
      include: {
        workoutDays: {
          include: {
            exercises: {
              orderBy: { order: "asc" },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return workoutPlans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      isActive: plan.isActive,
      workoutDays: plan.workoutDays.map((day) => ({
        id: day.id,
        name: day.name,
        weekDay: day.weekDay,
        isRest: day.isRest,
        coverImageUrl: day.coverImageUrl ?? undefined,
        estimatedDurationInSeconds: day.estimatedDurationInSeconds,
        exercises: day.exercises.map((exercise) => ({
          id: exercise.id,
          name: exercise.name,
          order: exercise.order,
          sets: exercise.sets,
          reps: exercise.reps,
          restTimeInSeconds: exercise.restTimeInSeconds,
        })),
      })),
    }));
  }
}
