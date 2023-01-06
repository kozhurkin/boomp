/**
 * Stylize a string
 */

var $ = {};

var styles = {
	'bold'         : [1, 22], //[1, 21], //Mac bold no reset
	'dim'          : [2, 22],
	'italic'       : [3, 23],
	'underline'    : [4, 24],
	'blink'        : [5, 25],
	'reverse'      : [7, 27],
	'hidden'       : [8, 28],

	// foreground
	'black'        : [30, 39],
	'red'          : [31, 39],
	'green'        : [32, 39],
	'yellow'       : [33, 39],
	'blue'         : [34, 39],
	'magenta'      : [35, 39],
	'cyan'         : [36, 39],
	'lightgray'    : [37, 39],
	'darkgray'     : [90, 39],
	'lightred'     : [91, 39],
	'lightgreen'   : [92, 39],
	'lightyellow'  : [93, 39],
	'lightgblue'   : [94, 39],
	'lightmagenta' : [95, 39],
	'lightcyan'    : [96, 39],
	'white'        : [97, 39],

	//background
	'bgblack'        : [40, 49],
	'bgred'          : [41, 49],
	'bggreen'        : [42, 49],
	'bgyellow'       : [43, 49],
	'bgblue'         : [44, 49],
	'bgmagenta'      : [45, 49],
	'bgcyan'         : [46, 49],
	'bglightgray'    : [47, 49],
	'bgdarkgray'     : [100, 49],
	'bglightred'     : [101, 49],
	'bglightgreen'   : [102, 49],
	'bglightyellow'  : [103, 49],
	'bglightgblue'   : [104, 49],
	'bglightmagenta' : [105, 49],
	'bglightcyan'    : [106, 49],
	'bgwhite'        : [107, 49]
};

$.styles = styles;

function stylize(str, style) {
	return '\033[' + styles[style][0] + 'm' + str +
		   '\033[' + styles[style][1] + 'm';
};

function applyStyles(str){
	this.forEach(function(style){
		str = stylize(str, style);
	});
	return str;
};

function extend(obj){
	Object.keys(styles).forEach(function(style){

		var code = styles[style];

		Object.defineProperty(obj, style, {
			get: function() {
				function wrapper(){
					return applyStyles.apply(wrapper._styles, arguments);
				}
				wrapper._styles = (obj._styles || []).slice();
				wrapper._styles.push(style);
				extend(wrapper);
				return wrapper;
			}
		});
	})
}

extend($);

module.exports = $;