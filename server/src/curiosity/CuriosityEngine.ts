import { updateCuriosity, decideCuriosityAction, type CuriosityInput } from "../mental/curiosity";
import { shouldEnterExploration, type ExplorationContext } from "./ExplorationTrigger";

export const curiosityEngine = {
  update: updateCuriosity,
  decide: decideCuriosityAction,
  shouldExplore: shouldEnterExploration,
};

export type { CuriosityInput, ExplorationContext };
