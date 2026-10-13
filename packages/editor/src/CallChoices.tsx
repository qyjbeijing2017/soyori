import { createContext } from "react";
import type { CallChoice } from "./library-calls";
export const CallChoices = createContext<CallChoice[]>([]);
