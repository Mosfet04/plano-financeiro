import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Plano financeiro",
    short_name: "Plano",
    description: "Acompanhamento do plano do apartamento, das metas e do mês.",
    start_url: "/resumo",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f5f5",
    theme_color: "#5b5fc7",
    // O SVG cobre qualquer tamanho; o `rx` do retângulo já dá o recorte que o
    // Android espera de um ícone maskable.
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
  };
}
