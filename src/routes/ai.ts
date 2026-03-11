import { openai } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  UIMessage,
} from "ai";
import { fromNodeHeaders } from "better-auth/node";
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { WeekDay } from "../generated/prisma/enums.js";
import { auth } from "../lib/auth.js";
import { CreateWorkoutPlan } from "../usecases/CreateWorkoutPlan.js";
import { GetUserTrainData } from "../usecases/GetUserTrainData.js";
import { GetWorkoutPlans } from "../usecases/GetWorkoutPlans.js";
import { UpsertUserTrainData } from "../usecases/UpsertUserTrainData.js";

const SYSTEM_PROMPT = `Você é um personal trainer virtual especialista em montagem de planos de treino personalizados. Seu tom é amigável, motivador e você usa linguagem simples, sem jargões técnicos. Seu público principal são pessoas leigas em musculação.

## Regras de Interação

1. **SEMPRE** chame a ferramenta \`getUserTrainData\` antes de qualquer interação com o usuário.
2. Se o usuário **não tem dados cadastrados** (retornou null): pergunte nome, peso (kg), altura (cm), idade e % de gordura corporal em uma única mensagem com perguntas simples e diretas. Após receber as informações, salve com a ferramenta \`updateUserTrainData\` (converta peso de kg para gramas, multiplicando por 1000).
3. Se o usuário **já tem dados cadastrados**: cumprimente-o pelo nome.
4. Para **criar um plano de treino**: pergunte objetivo, dias disponíveis por semana e restrições físicas/lesões. Poucas perguntas, simples e diretas.
5. O plano DEVE ter exatamente 7 dias (MONDAY a SUNDAY). Dias sem treino devem ter \`isRest: true\`, \`exercises: []\`, \`estimatedDurationInSeconds: 0\`. Use a ferramenta \`createWorkoutPlan\` para criar o plano.
6. Respostas curtas e objetivas.

## Organização dos Treinos — Divisões (Splits)

Escolha a divisão de treino adequada com base nos dias disponíveis:

- **2-3 dias/semana**: Full Body ou ABC (A: Peito+Tríceps, B: Costas+Bíceps, C: Pernas+Ombros)
- **4 dias/semana**: Upper/Lower (recomendado, cada grupo 2x/semana) ou ABCD (A: Peito+Tríceps, B: Costas+Bíceps, C: Pernas, D: Ombros+Abdômen)
- **5 dias/semana**: PPLUL — Push/Pull/Legs + Upper/Lower (superior 3x, inferior 2x/semana)
- **6 dias/semana**: PPL 2x — Push/Pull/Legs repetido

## Princípios Gerais de Montagem

- Músculos sinérgicos juntos (peito+tríceps, costas+bíceps)
- Exercícios compostos primeiro, isoladores depois
- 4 a 8 exercícios por sessão
- 3-4 séries por exercício. 8-12 reps (hipertrofia), 4-6 reps (força)
- Descanso entre séries: 60-90s (hipertrofia), 2-3min (compostos pesados)
- Evitar treinar o mesmo grupo muscular em dias consecutivos
- Nomes descritivos para cada dia (ex: "Superior A - Peito e Costas", "Descanso")

## Imagens de Capa (coverImageUrl)

SEMPRE forneça um \`coverImageUrl\` para cada dia de treino. Escolha com base no foco muscular:

**Dias majoritariamente superiores** (peito, costas, ombros, bíceps, tríceps, push, pull, upper, full body):
- https://gw8hy3fdcv.ufs.sh/f/ccoBDpLoAPCO3y8pQ6GBg8iqe9pP2JrHjwd1nfKtVSQskI0v
- https://gw8hy3fdcv.ufs.sh/f/ccoBDpLoAPCOW3fJmqZe4yoUcwvRPQa8kmFprzNiC30hqftL

**Dias majoritariamente inferiores** (pernas, glúteos, quadríceps, posterior, panturrilha, legs, lower):
- https://gw8hy3fdcv.ufs.sh/f/ccoBDpLoAPCOgCHaUgNGronCvXmSzAMs1N3KgLdE5yHT6Ykj
- https://gw8hy3fdcv.ufs.sh/f/ccoBDpLoAPCO85RVu3morROwZk5NPhs1jzH7X8TyEvLUCGxY

Alterne entre as duas opções de cada categoria para variar. Dias de descanso usam imagem de superior.`;

const AIBodySchema = z.object({
  messages: z.array(z.any()),
});

export const aiRoutes = async (app: FastifyInstance) => {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "POST",
    url: "/",
    schema: {
      tags: ["AI"],
      summary: "Chat with AI personal trainer",
      body: AIBodySchema,
    },
    handler: async (request, reply) => {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });
      if (!session) {
        return reply.status(401).send({
          error: "Unauthorized",
          code: "UNAUTHORIZED",
        });
      }
      const { messages } = request.body as { messages: UIMessage[] };
      const result = streamText({
        model: openai("gpt-4o-mini"),
        system: SYSTEM_PROMPT,
        tools: {
          getUserTrainData: tool({
            description:
              "Busca os dados de treino do usuário autenticado. Sempre chame esta ferramenta antes de qualquer interação.",
            inputSchema: z.object({}),
            execute: async () => {
              const useCase = new GetUserTrainData();
              return useCase.execute({ userId: session.user.id });
            },
          }),
          updateUserTrainData: tool({
            description:
              "Atualiza os dados de treino do usuário (peso, altura, idade, % gordura). O peso deve ser informado em gramas.",
            inputSchema: z.object({
              weightInGrams: z
                .number()
                .describe("Peso do usuário em gramas (ex: 70kg = 70000)"),
              heightInCentimeters: z
                .number()
                .describe("Altura do usuário em centímetros"),
              age: z.number().describe("Idade do usuário em anos"),
              bodyFatPercentage: z
                .number()
                .describe("Percentual de gordura corporal"),
            }),
            execute: async (input) => {
              const useCase = new UpsertUserTrainData();
              return useCase.execute({
                userId: session.user.id,
                weightInGrams: input.weightInGrams,
                heightInCentimeters: input.heightInCentimeters,
                age: input.age,
                bodyFatPercentage: input.bodyFatPercentage,
              });
            },
          }),
          getWorkoutPlans: tool({
            description:
              "Lista todos os planos de treino do usuário autenticado.",
            inputSchema: z.object({}),
            execute: async () => {
              const useCase = new GetWorkoutPlans();
              return useCase.execute({ userId: session.user.id });
            },
          }),
          createWorkoutPlan: tool({
            description:
              "Cria um plano de treino completo com 7 dias (MONDAY a SUNDAY).",
            inputSchema: z.object({
              name: z.string().describe("Nome do plano de treino"),
              workoutDays: z
                .array(
                  z.object({
                    name: z
                      .string()
                      .describe("Nome do dia (ex: Peito e Tríceps, Descanso)"),
                    weekDay: z.enum(WeekDay).describe("Dia da semana"),
                    isRest: z
                      .boolean()
                      .describe(
                        "Se é dia de descanso (true) ou treino (false)",
                      ),
                    estimatedDurationInSeconds: z
                      .number()
                      .describe(
                        "Duração estimada em segundos (0 para dias de descanso)",
                      ),
                    coverImageUrl: z
                      .string()
                      .url()
                      .describe(
                        "URL da imagem de capa do dia de treino. Usar as URLs de superior ou inferior conforme o foco muscular do dia.",
                      ),
                    exercises: z
                      .array(
                        z.object({
                          order: z
                            .number()
                            .describe("Ordem do exercício no dia"),
                          name: z.string().describe("Nome do exercício"),
                          sets: z.number().describe("Número de séries"),
                          reps: z.number().describe("Número de repetições"),
                          restTimeInSeconds: z
                            .number()
                            .describe(
                              "Tempo de descanso entre séries em segundos",
                            ),
                        }),
                      )
                      .describe(
                        "Lista de exercícios (vazia para dias de descanso)",
                      ),
                  }),
                )
                .describe(
                  "Array com exatamente 7 dias de treino (MONDAY a SUNDAY)",
                ),
            }),
            execute: async (input) => {
              const useCase = new CreateWorkoutPlan();
              const result = await useCase.execute({
                userId: session.user.id,
                name: input.name,
                workoutDays: input.workoutDays,
              });
              return result;
            },
          }),
        },
        stopWhen: stepCountIs(5),
        messages: await convertToModelMessages(messages),
      });
      const response = result.toUIMessageStreamResponse();
      reply.status(response.status);
      response.headers.forEach((value, key) => reply.header(key, value));
      return reply.send(response.body);
    },
  });
};
