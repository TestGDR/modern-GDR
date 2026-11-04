import type { Metadata } from "next";
import { FameRanking } from "@/components/fame/fame-ranking";
import { PageHeader } from "@/components/game/page-header";
import { BackToUtility } from "@/components/game/utility";

export const metadata: Metadata = { title: "Fama" };

export default function Page() {
  return (
    <>
      <BackToUtility />
      <PageHeader title="Fama" subtitle="I personaggi più famosi del campus: background, imprese e badge." />
      <FameRanking />
    </>
  );
}
