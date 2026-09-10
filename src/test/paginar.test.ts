import { describe, it, expect, vi } from "vitest";
import { traerTodo, LIMITE_POSTGREST } from "@/lib/paginar";

/** Una tabla falsa que se comporta como PostgREST: nunca devuelve más de 1000. */
const tabla = (filas: number) => {
  const rango: Array<[number, number]> = [];
  const todo = Array.from({ length: filas }, (_, i) => ({ id: i }));
  const consulta = (desde: number, hasta: number) => {
    rango.push([desde, hasta]);
    const tope = Math.min(hasta, desde + LIMITE_POSTGREST - 1);
    return Promise.resolve({ data: todo.slice(desde, tope + 1), error: null });
  };
  return { consulta, rango };
};

describe("traerTodo", () => {
  it("una tabla corta se lee de una sola consulta", async () => {
    const { consulta, rango } = tabla(12);
    const { data, error } = await traerTodo(consulta);
    expect(error).toBeNull();
    expect(data).toHaveLength(12);
    expect(rango).toHaveLength(1);
  });

  it("pasando de mil sigue pidiendo hasta que el tramo llega corto", async () => {
    const { consulta, rango } = tabla(1784);
    const { data } = await traerTodo(consulta);
    expect(data).toHaveLength(1784);
    expect(data![1783]).toEqual({ id: 1783 });
    expect(rango).toEqual([[0, 999], [1000, 1999]]);
  });

  it("un múltiplo exacto de mil pide un tramo más para saber que ya no hay", async () => {
    const { consulta, rango } = tabla(2000);
    const { data } = await traerTodo(consulta);
    expect(data).toHaveLength(2000);
    expect(rango).toHaveLength(3);
  });

  /**
   * Media lista se ve igual que una lista completa. Si la lectura falla, el
   * error se devuelve como error —con `data` en null— y quien llama decide
   * qué decir; nunca se entrega lo que alcanzó a juntar como si estuviera
   * entero.
   */
  it("si un tramo falla no devuelve lo que ya había juntado", async () => {
    let n = 0;
    const { data, error } = await traerTodo(() => {
      n++;
      if (n === 1) return Promise.resolve({ data: Array.from({ length: 1000 }, (_, i) => ({ id: i })), error: null });
      return Promise.resolve({ data: null, error: { message: "se cayó la red" } });
    });
    expect(data).toBeNull();
    expect(error).toEqual({ message: "se cayó la red" });
  });

  it("no se cicla para siempre si los tramos nunca acortan", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { data } = await traerTodo(
      () => Promise.resolve({ data: [{ id: 1 }, { id: 2 }], error: null }),
      2,
    );
    expect(data).toHaveLength(200);
    expect(aviso).toHaveBeenCalled();
    aviso.mockRestore();
  });
});
