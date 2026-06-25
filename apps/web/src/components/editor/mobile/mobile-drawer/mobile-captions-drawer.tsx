"use client";

import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import { useTranslation } from "@i18next-toolkit/nextjs-approuter";
import { Captions } from "../../panels/assets/views/captions";
import { useMobileDrawerStore } from "../hooks/use-mobile-drawer";

export function MobileCaptionsDrawer() {
	const { t } = useTranslation();
	const { activeDrawer, closeDrawer } = useMobileDrawerStore();
	const isOpen = activeDrawer === "captions";

	return (
		<Drawer
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) closeDrawer();
			}}
			shouldScaleBackground={false}
		>
			<DrawerContent className="max-h-[78vh]">
				<DrawerHeader>
					<DrawerTitle>{t("Captions")}</DrawerTitle>
					<DrawerDescription className="sr-only">
						{t("Caption diagnostics and generation controls")}
					</DrawerDescription>
				</DrawerHeader>
				<div className="min-h-0 overflow-y-auto px-4 pb-6">
					<div className="h-[62vh]">
						<Captions />
					</div>
				</div>
			</DrawerContent>
		</Drawer>
	);
}
