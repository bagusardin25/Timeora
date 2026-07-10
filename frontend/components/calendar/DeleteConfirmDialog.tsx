"use client";

import { Trash2, AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useI18n } from "@/components/i18n-provider";

type DeleteConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventTitle?: string;
  onConfirm: () => void;
  isDeleting?: boolean;
};

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  eventTitle,
  onConfirm,
  isDeleting,
}: DeleteConfirmDialogProps) {
  const { t } = useI18n();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <AlertDialogTitle className="text-center">
            {t("calendar.deleteConfirmTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            {eventTitle
              ? t("calendar.deleteConfirmDescNamed", { title: eventTitle })
              : t("calendar.deleteConfirmDesc")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-2">
          <AlertDialogCancel disabled={isDeleting} className="min-h-11 rounded-xl">
            {t("calendar.deleteCancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isDeleting}
            className="min-h-11 rounded-xl gap-2"
            onClick={() => onConfirm()}
          >
            <Trash2 className="h-4 w-4" />
            {isDeleting ? t("calendar.deleting") : t("calendar.deleteConfirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
