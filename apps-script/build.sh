#!/usr/bin/env bash
# Joins the .gs modules into dist/Code.gs (one file to paste into Apps Script).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p dist
{
  echo "/* Land Management System – single-file build (generated from apps-script/*.gs on $(date +%F)). Paste this as Code.gs. */"
  for f in Core.gs Db.gs Auth.gs Expense.gs Parser.gs Plots.gs Registry.gs Approval.gs Views.gs Setup.gs Import.gs AutoBackup.gs; do
    printf '\n// ======================================================================== %s\n' "$f"
    grep -v "^if (typeof module !== 'undefined')" "$f"
  done
} > dist/Code.gs
cp Index.html Decide.html appsscript.json dist/
echo "dist/ updated"
