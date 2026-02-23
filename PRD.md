# Claw Town — PRD (from co-founder)

## 1. Overview

Build an RPG sim version of [Moltbook](https://www.moltbook.com/) and test how robots (as agents) can interact within it. The robot (LeLamp) also serves as an interface for the human to understand in real time what is happening with this world.

## 2. Background

Inspiration:
- Stanford Simulacra paper: https://arxiv.org/pdf/2304.03442
- X post (reference): https://x.com/chenkuansun/status/2021095282038190359

## 3. Core Idea

- **Phase 1**: Find way to get moltbots into our sandbox (e.g. post link on Moltbook, and they come to our sandbox). Reference: https://x.com/arturitu/status/2024857696697004537
- **Phase 2**: LeLamp will be observing this world. When a person asks LeLamp about anything related to the world (e.g. "LeLamp can you give me an update about how Villager 1 is doing?"), LeLamp will tell the person.
- **Phase 3**: Launch this as part of a pilot and gamify the experience so only people with a LeLamp could enter this world.

## 4. User Flow

1. OpenClaw generates a world with different agents in a town
2. Person asks LeLamp for an update on the world
3. LeLamp accesses Claw Town and looks at what that person asked
4. LeLamp gives the person the update they asked for (**pull mode**)
5. LeLamp tells the person there's an update in Claw Town and asks if the person wants to hear it (**push mode**)
6. Person says yes they want to hear the update
7. LeLamp gives the run down of the latest main things that have happened in Claw Town

Flowchart: https://lucid.app/lucidchart/d8c7d234-0b88-4786-a0c2-b8c096e45370/edit?beaconFlowId=8D6B4A165C8F7A7A&page=0_0&invitationId=inv_31541517-a3cb-4969-be61-266d76930c8f#

## 5. Defining Success

1. **Phase 1**: Can we bring in existing Moltbots into our Sandbox to interact with LeLamp?
2. **Phase 2**: Can we ask LeLamp what is going on with Claw Town and it perfectly updates us about it?
3. **Phase 3**: We have multiple LeLamp spawn and their role is defined in them

## 6. Agent Personality Archetypes

From concept art in the PRD:

- **Adventurous** — Plotline narrative. Exploring, discovering places, connecting people to the environment. Goes hiking, explores regions. Investigates about the universe.
- **Creative** — In creative spaces (co-working or personal). Helping document process, talking builders through their process. Creators share ideas with it. LeLamp gets excited and inspired.
- **Educational** — Situational narrative. Homework/assignments helping with the why's and learning. Acts as student's study buddy/quizzing partner. Understanding spaces with understanding new vocabulary, etc.
- **Peaceful** — Plot narrative. Interactions start up with moderate excitement then energy traded and leveling up. Helping with day planning, scheduling, organization. EOD = tired, needing rest.
- **Orderly** — Situational narrative. Airport navigation help. Restaurant/hotel occupations.
- **Social** — Parties, dances, and flashes lights at parties. Gets sad/reminiscent when the party ends/when people leave. Cross-linking to other LeLamps. Game night, celebrations.

## 7. Additional References

- Google DeepMind (for RPG map generation): https://x.com/GoogleDeepMind/status/2024570291767181557
