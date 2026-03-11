import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";

import { NotFoundError } from "../errors/index.js";
import { WeekDay } from "../generated/prisma/enums.js";
import { prisma } from "../lib/db.js";

dayjs.extend(utc);

interface InputDto {
  userId: string;
  date: string;
}

interface OutputDto {
  activeWorkoutPlanId: string;
  todayWorkoutDay: {
    workoutPlanId: string;
    id: string;
    name: string;
    isRest: boolean;
    weekDay: WeekDay;
    estimatedDurationInSeconds: number;
    coverImageUrl?: string;
    exercisesCount: number;
  };
  workoutStreak: number;
  consistencyByDay: Record<
    string,
    {
      workoutDayCompleted: boolean;
      workoutDayStarted: boolean;
    }
  >;
}

const dayIndexToWeekDay: Record<number, WeekDay> = {
  0: "SUNDAY",
  1: "MONDAY",
  2: "TUESDAY",
  3: "WEDNESDAY",
  4: "THURSDAY",
  5: "FRIDAY",
  6: "SATURDAY",
};

export class GetHomeData {
  async execute(dto: InputDto): Promise<OutputDto> {
    const currentDate = dayjs.utc(dto.date);
    const weekDay = dayIndexToWeekDay[currentDate.day()];

    // Get active workout plan
    const activeWorkoutPlan = await prisma.workoutPlan.findFirst({
      where: {
        userId: dto.userId,
        isActive: true,
      },
      include: {
        workoutDays: {
          include: {
            exercises: true,
            sessions: true,
          },
        },
      },
    });

    if (!activeWorkoutPlan) {
      throw new NotFoundError("No active workout plan found");
    }

    // Find today's workout day
    const todayWorkoutDay = activeWorkoutPlan.workoutDays.find(
      (day) => day.weekDay === weekDay,
    );

    if (!todayWorkoutDay) {
      throw new NotFoundError("No workout day found for today");
    }

    // Calculate week boundaries (Sunday to Saturday)
    const weekStart = currentDate.startOf("week").utc();
    const weekEnd = currentDate.endOf("week").utc();

    // Get all sessions within the week
    const sessionsInWeek = await prisma.workoutSession.findMany({
      where: {
        workoutDay: {
          workoutPlan: {
            userId: dto.userId,
          },
        },
        startedAt: {
          gte: weekStart.toDate(),
          lte: weekEnd.toDate(),
        },
      },
    });

    // Build consistencyByDay
    const consistencyByDay: Record<
      string,
      { workoutDayCompleted: boolean; workoutDayStarted: boolean }
    > = {};

    for (let i = 0; i < 7; i++) {
      const dayDate = weekStart.add(i, "day").format("YYYY-MM-DD");
      const sessionsForDay = sessionsInWeek.filter(
        (session) =>
          dayjs.utc(session.startedAt).format("YYYY-MM-DD") === dayDate,
      );

      const hasCompletedSession = sessionsForDay.some(
        (session) => session.completedAt !== null,
      );
      const hasStartedSession = sessionsForDay.length > 0;

      consistencyByDay[dayDate] = {
        workoutDayCompleted: hasCompletedSession,
        workoutDayStarted: hasStartedSession,
      };
    }

    // Calculate workout streak
    const workoutStreak = await this.calculateStreak(dto.userId, currentDate);

    return {
      activeWorkoutPlanId: activeWorkoutPlan.id,
      todayWorkoutDay: {
        workoutPlanId: activeWorkoutPlan.id,
        id: todayWorkoutDay.id,
        name: todayWorkoutDay.name,
        isRest: todayWorkoutDay.isRest,
        weekDay: todayWorkoutDay.weekDay,
        estimatedDurationInSeconds: todayWorkoutDay.estimatedDurationInSeconds,
        coverImageUrl: todayWorkoutDay.coverImageUrl ?? undefined,
        exercisesCount: todayWorkoutDay.exercises.length,
      },
      workoutStreak,
      consistencyByDay,
    };
  }

  private async calculateStreak(
    userId: string,
    currentDate: dayjs.Dayjs,
  ): Promise<number> {
    // Get all completed sessions for this user, ordered by date desc
    const completedSessions = await prisma.workoutSession.findMany({
      where: {
        workoutDay: {
          workoutPlan: {
            userId,
          },
        },
        completedAt: { not: null },
      },
      orderBy: {
        startedAt: "desc",
      },
    });

    if (completedSessions.length === 0) {
      return 0;
    }

    // Group sessions by date
    const sessionsByDate = new Map<string, boolean>();
    for (const session of completedSessions) {
      const dateKey = dayjs.utc(session.startedAt).format("YYYY-MM-DD");
      sessionsByDate.set(dateKey, true);
    }

    // Count consecutive days going backwards from current date
    let streak = 0;
    let checkDate = currentDate;

    while (true) {
      const dateKey = checkDate.format("YYYY-MM-DD");
      if (sessionsByDate.has(dateKey)) {
        streak++;
        checkDate = checkDate.subtract(1, "day");
      } else {
        break;
      }
    }

    return streak;
  }
}
