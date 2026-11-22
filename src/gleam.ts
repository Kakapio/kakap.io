import {
  List$Empty,
  List$isNonEmpty,
  List$NonEmpty,
  List$NonEmpty$first,
  List$NonEmpty$rest,
  type List,
} from "@gleam/prelude.mjs";

export function toArray<T>(list: List<T>): T[] {
  const out: T[] = [];
  let rest: List<T> | undefined = list;
  while (rest !== undefined && List$isNonEmpty(rest)) {
    out.push(List$NonEmpty$first(rest) as T);
    rest = List$NonEmpty$rest(rest);
  }
  return out;
}

export function fromArray<T>(items: readonly T[]): List<T> {
  let list = List$Empty<T>();
  for (let i = items.length - 1; i >= 0; i--) list = List$NonEmpty(items[i]!, list);
  return list;
}
