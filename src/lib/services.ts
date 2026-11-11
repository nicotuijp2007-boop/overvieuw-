import { services, type ServiceIconName } from "@config/limits.config";

export interface ServiceLook {
  name: string;
  color: string;
  icon: ServiceIconName;
}

/** Name, identity color and icon of a service, from limits.config.ts. */
export function serviceLook(id: string): ServiceLook {
  const s = services[id];
  return { name: s?.name ?? id, color: s?.color ?? "#8a8f98", icon: s?.icon ?? "box" };
}
