//TODO move the setHunterID, unsetHunterID, etc into a module and require it here
const {unsetHunterID, setHunterID, setHunterProperty } = require('../modules/hunterRegistry');
module.exports = {
    name: 'iam',
    args: true,
    usage: [
        '#### - provide a number to set your hunter ID',
        'rank <rank> - identify your rank',
        'in <location> - identify where you\'re hunting / looking for friends',
        'snuid #### - sets your in-game user id',
        'not - removes you from the registry',
    ].join('\n\t'),
    description: 'Identify yourself so others can find/friend you',
    execute(message, tokens) {
        if (!tokens.length)
            message.channel.send('Yes, you are. Provide a hunter ID number to set that.');
        else if (tokens.length === 1 && !isNaN(parseInt(tokens[0], 10)))
            setHunterID(message, tokens[0]);
        else if (tokens.length === 1 && tokens[0].toLowerCase() === 'not')
            unsetHunterID(message);
        else {
            // received -mh iam <words>. The user can specify where they are hunting, their rank/title, or their in-game id.
            // Nobody should need this many tokens to specify their input, but someone is gonna try for more.
            let userText = tokens.slice(1, 10).join(' ').trim().toLowerCase();
            const userCommand = tokens[0].toLowerCase();
            if (userCommand === 'in' && userText) {
                if (message.client.nicknames.get('locations')[userText])
                    userText = message.client.nicknames.get('locations')[userText];
                setHunterProperty(message, 'location', userText);
            } else if (['rank', 'title', 'a'].indexOf(userCommand) !== -1 && userText) {
                if (message.client.nicknames.get('ranks')[userText])
                    userText = message.client.nicknames.get('ranks')[userText];
                setHunterProperty(message, 'rank', userText);
            } else if (userCommand.substring(0, 3) === 'snu' && userText)
                setHunterProperty(message, 'snuid', userText);
            else {
                const prefix = message.client.settings.botPrefix;
                const commandSyntax = [
                    'I\'m not sure what to do with that. Try:',
                    `\`${prefix} iam ####\` to set a hunter ID.`,
                    `\`${prefix} iam rank <rank>\` to set a rank.`,
                    `\`${prefix} iam in <location>\` to set a location`,
                    `\`${prefix} iam snuid ####\` to set your in-game user id`,
                    `\`${prefix} iam not\` to unregister (and delete your data)`,
                ];
                message.channel.send(commandSyntax.join('\n\t'));
            }
        }

    }
};
