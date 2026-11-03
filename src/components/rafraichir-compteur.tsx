"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function RafraichirCompteur() {
  const router = useRouter();
  useEffect(() => {
    router.refresh();
  }, [router]);
  return null;
}
