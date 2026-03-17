import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
  name?: string;
  weightInGrams: number;
  heightInCentimeters: number;
  age: number;
  bodyFatPercentage: number;
}

interface OutputDto {
  userId: string;
  weightInGrams: number;
  heightInCentimeters: number;
  age: number;
  bodyFatPercentage: number;
}

export class UpsertUserTrainData {
  async execute(dto: InputDto): Promise<OutputDto> {
    const updatedUser = await prisma.user.update({
      where: { id: dto.userId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        weightInGrams: dto.weightInGrams,
        heightInCentimeters: dto.heightInCentimeters,
        age: dto.age,
        bodyFatPercentage: dto.bodyFatPercentage,
      },
    });

    return {
      userId: updatedUser.id,
      weightInGrams: updatedUser.weightInGrams!,
      heightInCentimeters: updatedUser.heightInCentimeters!,
      age: updatedUser.age!,
      bodyFatPercentage: updatedUser.bodyFatPercentage!,
    };
  }
}
