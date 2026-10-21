const USER = 'antoniolozbez';
const DOMAIN = 'gmail.com';
// Gmail delivers user+tag@ to user@: the tag shows which mail came from here, and the page hides it
const TAG = 'hoard';

export function MailLink() {
    return (
        <a href={`mailto:${USER}+${TAG}@${DOMAIN}`}>
            {USER}
            <span aria-hidden="true" className="visually-hidden">{`+${TAG}`}</span>
            {`@${DOMAIN}`}
        </a>
    );
}
