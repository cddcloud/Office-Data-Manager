-- Only the six deterministic NEW-install identities receive the owner-approved
-- reference labels. Populated legacy root IDs require explicit slot mappings.
UPDATE "Category" c SET name = names.name
FROM (VALUES
  (1, 'မဟာဗျူဟာနှင့် မူဝါဒ'),
  (2, 'ဖွဲ့စည်းပုံနှင့်အင်အား'),
  (3, 'ဘဏ္ဍာရေး'),
  (4, 'ဝန်ကြီးဌာနများ ကော်မတီ၊ကော်မရှင်များ'),
  (5, 'မဟာမိတ်စုဖွဲ့မှု'),
  (6, 'ဖက်ဒရယ်ယူနစ်ဆိုင်ရာ')
) AS names(slot, name)
WHERE c.id = 'cmainfolder00000000000000' || names.slot
  AND c."mainSlot" = names.slot AND c.name = 'Main Folder ' || names.slot;
