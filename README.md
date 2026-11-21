# Land-Mangememt

Land Management System for housing schemes. It covers land purchase, layout (roads, parks, masjid, green belt, graveyard), plot sales, a registry workflow with **director approval by email**, and the complete ownership history of every plot.

Built with Laravel 12 + MySQL. English / اردو.

Full design: [docs/DESIGN.md](docs/DESIGN.md)

## Setup

```bash
composer install
cp .env.example .env
php artisan key:generate
# set DB_*, MAIL_*, IMAP_*, LANDMS_* in .env
php artisan migrate --seed        # prints the first admin password
php artisan storage:link
php artisan serve
```

Cron (needed for reading the director's email replies):

```
* * * * * cd /path/to/app && php artisan schedule:run >> /dev/null 2>&1
```

### Gmail

1. Turn on 2-Step Verification on the office Gmail account.
2. Create an **App Password**. Put it in `MAIL_PASSWORD` and `IMAP_PASSWORD`.
3. In Gmail settings, make sure IMAP is enabled.
4. Test with: `php artisan approvals:poll-inbox`

## Tests

```bash
php artisan test        # or vendor/bin/phpunit
```

The expense calculator test checks the exact figures of the Google Sheet (Rs 213,200 and Rs 103,125).
