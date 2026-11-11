import type { Connector } from "./types";
import { claudeCode } from "./claude-code";
import { mock, mockBroken } from "./mock";
import { netlify } from "./netlify";
import { supabase } from "./supabase";

/**
 * All connectors. To add a service: create a file in this folder exporting a Connector,
 * add it here, and add an entry with the same id to limits.config.ts.
 */
export const connectors: Connector[] = [mock, mockBroken, claudeCode, netlify, supabase];
