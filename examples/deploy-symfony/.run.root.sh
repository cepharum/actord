#!/usr/bin/env bash

#
# On accessing some protected git repository required authentication should be
# written to file /root/.netrc like this:
#
#     machine git.example.com
#     login your-username
#     password the-secret-password-here
#
# Make sure the file readable by its owner, only.
#


if [ "$HOME" != "/root" ]; then
        echo "switching to elevated login shell" >&2
        su - -c "$0"
        exit $?
fi




WWWDIR=/var/www/app.example.com


UMASK="$(umask)"
umask 0007

mkdir -p "$WWWDIR"

cd "$WWWDIR"


UPDATE=false

if [ -d .git ]; then
        # there is an existing git repository -> check for updates
        git fetch || exit 76

        if git status -sb | grep -E '\bbehind\b' &>/dev/null; then
                git pull || exit 76

                UPDATE=true
        fi
else
        # there is no git repository -> clone from remote server
        rm -Rf *
        rm -Rf .*

        git clone https://git.example.com/username/repo.git .

        cat >.env <<EOT
APP_ENV=prod
APP_SECRET="$(dd if=/dev/urandom count=256 2>/dev/null | sha1sum | head -c 32)"
DATABASE_URL=mysql://dbusername:dbpassword@dbserver/dbname
EOT

        UPDATE=true
fi

chmod o-rwx . -R
chown www-data:www-data . -R

umask "$UMASK"


if $UPDATE; then
        sudo -u www-data /bin/bash <<EOT
cd "$WWWDIR"
composer update -n --no-ansi --no-progress
bin/console -n doctrine:migrations:migrate
EOT
else
        echo "skipping update of application" >&2
fi
