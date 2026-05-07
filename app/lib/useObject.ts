import { useReducer, useState } from "react";

type DataSnapshot = Record<string, unknown>;

function snapshot(obj: object): DataSnapshot {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => typeof v !== "function")
  );
}

function hasChanged(before: DataSnapshot, after: DataSnapshot): boolean {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    if (before[k] !== after[k]) return true;
  }
  return false;
}

export function useObject<T extends object, Args extends unknown[]>(
  Constructor: new (...args: Args) => T,
  ...args: Args
): T {
  const [, rerender] = useReducer((n) => n + 1, 0);

  const [proxy] = useState<T>(() => {
    const self = new Proxy(new Constructor(...args), {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);

        if (typeof value !== "function") return value;

        return (...callArgs: unknown[]) => {
          const before = snapshot(target);
          const result = (value as (...a: unknown[]) => unknown).apply(
            self,
            callArgs
          );
          if (hasChanged(before, snapshot(target))) rerender();
          return result;
        };
      },
    });

    return self;
  });

  return proxy;
}
