import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";

import { prisma } from "../lib/db.js";

dayjs.extend(utc);

interface InputDto {
  userId: string;
  from: string;
  to: string;
}

interface OutputDto {
  workoutStreak: number;
  consistencyByDay: Record<
    string,
    {
      workoutDayCompleted: boolean;
      workoutDayStarted: boolean;
    }
  >;
  completedWorkoutsCount: number;
  conclusionRate: number;
  totalTimeInSeconds: number;
}

export class GetStats {
  async execute(dto: InputDto): Promise<OutputDto> {
    const fromDate = dayjs.utc(dto.from).startOf("day");
    const toDate = dayjs.utc(dto.to).endOf("day");

    // Fetch all sessions in the range
    const sessions = await prisma.workoutSession.findMany({
      where: {
        workoutDay: {
          workoutPlan: {
            userId: dto.userId,
          },
        },
        startedAt: {
          gte: fromDate.toDate(),
          lte: toDate.toDate(),
        },
      },
    });

    // Build consistencyByDay - only include days with sessions
    const consistencyByDay: Record<
      string,
      { workoutDayCompleted: boolean; workoutDayStarted: boolean }
    > = {};

    const sessionsByDate = new Map<
      string,
      { started: boolean; completed: boolean }
    >();

    for (const session of sessions) {
      const dateKey = dayjs.utc(session.startedAt).format("YYYY-MM-DD");
      const existing = sessionsByDate.get(dateKey) || {
        started: false,
        completed: false,
      };

      existing.started = true;
      if (session.completedAt !== null) {
        existing.completed = true;
      }

      sessionsByDate.set(dateKey, existing);
    }

    for (const [dateKey, value] of sessionsByDate) {
      consistencyByDay[dateKey] = {
        workoutDayStarted: value.started,
        workoutDayCompleted: value.completed,
      };
    }

    // Calculate completedWorkoutsCount
    const completedWorkoutsCount = sessions.filter(
      (s) => s.completedAt !== null,
    ).length;

    // Calculate conclusionRate
    const totalSessions = sessions.length;
    const conclusionRate =
      totalSessions > 0 ? completedWorkoutsCount / totalSessions : 0;

    // Calculate totalTimeInSeconds
    let totalTimeInSeconds = 0;
    for (const session of sessions) {
      if (session.completedAt !== null) {
        const startedAt = dayjs.utc(session.startedAt);
        const completedAt = dayjs.utc(session.completedAt);
        totalTimeInSeconds += completedAt.diff(startedAt, "second");
      }
    }

    // Calculate workout streak
    const workoutStreak = await this.calculateStreak(dto.userId, toDate);

    return {
      workoutStreak,
      consistencyByDay,
      completedWorkoutsCount,
      conclusionRate,
      totalTimeInSeconds,
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
