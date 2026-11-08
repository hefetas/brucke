// Pazar günleri için gerçek hayat görevleri (hedef dili gerçek bir bağlamda kullanma).

export interface RealWorldTask {
  title: string;
  steps_tr: string;
}

export const REAL_WORLD: Record<string, RealWorldTask[]> = {
  en: [
    { title: 'Telefonu İngilizceye çevir', steps_tr: 'Telefonunun ya da bir uygulamanın dilini bugün İngilizce yap. Karşılaştığın 5 yeni kelimeyi not et.' },
    { title: 'Sesli düşün', steps_tr: 'Bugün yaptığın üç şeyi İngilizce, yüksek sesle anlat (örn. "I made coffee, then I…"). Takıldığın kelimeleri yaz.' },
    { title: 'Tarif ya da video', steps_tr: 'İngilizce altyazılı kısa bir video ya da tarif izle. Anladığın bir cümleyi ve anlamadığın iki kelimeyi not et.' },
    { title: 'Alışveriş listesi', steps_tr: 'Bu haftanın alışveriş listesini İngilizce yaz. En az 10 madde olsun, bilmediklerini sözlükten bul.' },
    { title: 'Kısa günlük', steps_tr: 'Bugün hakkında 3 cümlelik İngilizce bir günlük yaz ve bir kez yüksek sesle oku.' },
    { title: 'Etrafı adlandır', steps_tr: 'Odandaki 15 nesneyi İngilizce adlandır. Bilmediklerini bulup kartlara ekle.' },
  ],
  de: [
    { title: 'Telefonu Almancaya çevir', steps_tr: 'Telefonunun ya da bir uygulamanın dilini bugün Almanca yap. Karşılaştığın 5 yeni kelimeyi artikeliyle not et.' },
    { title: 'Sesli düşün', steps_tr: 'Bugün yaptığın üç şeyi Almanca, yüksek sesle anlat (örn. "Ich habe Kaffee gemacht, dann…"). Takıldığın kelimeleri yaz.' },
    { title: 'Tarif ya da video', steps_tr: 'Almanca altyazılı kısa bir video ya da tarif izle. Anladığın bir cümleyi ve anlamadığın iki kelimeyi not et.' },
    { title: 'Alışveriş listesi', steps_tr: 'Bu haftanın alışveriş listesini Almanca yaz; her ismin yanına der/die/das ekle. En az 10 madde olsun.' },
    { title: 'Kısa günlük', steps_tr: 'Bugün hakkında 3 cümlelik Almanca bir günlük yaz ve bir kez yüksek sesle oku.' },
    { title: 'Etrafı adlandır', steps_tr: 'Odandaki 15 nesneyi artikeliyle Almanca adlandır. Bilmediklerini bulup kartlara ekle.' },
  ],
};

export function realWorldFor(lang: string, date: string): RealWorldTask {
  const list = REAL_WORLD[lang] ?? REAL_WORLD.en;
  const day = Math.floor(new Date(`${date}T12:00:00Z`).getTime() / 86_400_000);
  return list[day % list.length];
}
